//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {CallLike, NamedNode} from "../psi/TolkNode"
import {Constant} from "../psi/Decls"
import {Reference} from "../psi/Reference"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {TolkFile} from "../psi/TolkFile"
import {crc16} from "@server/utils/crc16"
import {crc32} from "@server/utils/crc32"
import {sha256, sha256_32} from "@server/utils/sha256"
import {stringToBase256} from "@server/utils/stringToBase256"

const compileTimeFunctions = new Set([
    "stringCrc32",
    "stringCrc16",
    "stringSha256",
    "stringSha256_32",
    "stringToBase256",
])

export interface EvaluationResult {
    readonly value: bigint | string | boolean | null
    readonly type: "int" | "bool" | "unknown"
}

export class ConstantEvaluator {
    private readonly evaluationStack: Set<string> = new Set()
    private readonly evaluatedConstants: Map<string, EvaluationResult> = new Map()

    public static evaluateConstant(constant: Constant): EvaluationResult {
        const evaluator = new ConstantEvaluator()
        return evaluator.evaluateConstantImpl(constant)
    }

    public static isSimpleLiteral(node: SyntaxNode | null | undefined): boolean {
        if (!node) return true
        return (
            node.type === "number_literal" ||
            node.type === "string_literal" ||
            node.type === "boolean_literal" ||
            node.type === "null_literal"
        )
    }

    private evaluateConstantImpl(constant: Constant): EvaluationResult {
        const constantId = `${constant.file.uri}:${constant.name()}`

        if (this.evaluationStack.has(constantId)) {
            // circular dependency
            return {value: null, type: "unknown"}
        }

        const cached = this.evaluatedConstants.get(constantId)
        if (cached) {
            return cached
        }

        this.evaluationStack.add(constantId)

        try {
            const valueExpr = constant.value()
            if (!valueExpr) {
                return {value: null, type: "unknown"}
            }

            const result = this.evaluateExpressionImpl(valueExpr.node, valueExpr.file)
            this.evaluatedConstants.set(constantId, result)
            return result
        } finally {
            this.evaluationStack.delete(constantId)
        }
    }

    private evaluateExpressionImpl(node: SyntaxNode, file: TolkFile): EvaluationResult {
        switch (node.type) {
            case "number_literal": {
                return this.evaluateNumberLiteral(node)
            }
            case "boolean_literal": {
                return this.evaluateBooleanLiteral(node)
            }
            case "identifier":
            case "type_identifier": {
                return this.evaluateReference(node, file)
            }
            case "binary_operator": {
                return this.evaluateBinaryOperator(node, file)
            }
            case "unary_operator": {
                return this.evaluateUnaryOperator(node, file)
            }
            case "parenthesized_expression": {
                return this.evaluateParenthesizedExpression(node, file)
            }
            case "cast_as_operator": {
                return this.evaluateCastAsOperator(node, file)
            }
            case "function_call": {
                return this.evaluateFunctionCall(node, file)
            }
            default: {
                return {value: null, type: "unknown"}
            }
        }
    }

    private evaluateNumberLiteral(node: SyntaxNode): EvaluationResult {
        const text = node.text

        try {
            const value = BigInt(text)

            const max257bit = (BigInt(1) << BigInt(256)) - BigInt(1)
            const min257bit = -(BigInt(1) << BigInt(256))

            if (value > max257bit || value < min257bit) {
                return {value: null, type: "unknown"}
            }

            return {value, type: "int"}
        } catch {
            return {value: null, type: "unknown"}
        }
    }

    private evaluateBooleanLiteral(node: SyntaxNode): EvaluationResult {
        const text = node.text
        if (text === "true") {
            return {value: true, type: "bool"}
        } else if (text === "false") {
            return {value: false, type: "bool"}
        }
        return {value: null, type: "unknown"}
    }

    private evaluateReference(node: SyntaxNode, file: TolkFile): EvaluationResult {
        const namedNode = new NamedNode(node, file)
        const resolved = Reference.resolve(namedNode, true)

        if (resolved instanceof Constant) {
            return this.evaluateConstantImpl(resolved)
        }

        return {value: null, type: "unknown"}
    }

    private evaluateBinaryOperator(node: SyntaxNode, file: TolkFile): EvaluationResult {
        const operatorNode = node.childForFieldName("operator_name")
        if (!operatorNode) return {value: null, type: "unknown"}

        const operator = operatorNode.text

        const children = node.namedChildren
            .filter(it => it?.type !== "comment")
            .filter(it => it != null)
        const leftNode = children.at(0)
        const rightNode = children.at(-1)

        if (!leftNode || !rightNode) return {value: null, type: "unknown"}

        const left = this.evaluateExpressionImpl(leftNode, file)
        const right = this.evaluateExpressionImpl(rightNode, file)

        return this.applyBinaryOperator(operator, left, right)
    }

    private applyBinaryOperator(
        operator: string,
        left: EvaluationResult,
        right: EvaluationResult,
    ): EvaluationResult {
        if (
            left.type === "int" &&
            right.type === "int" &&
            typeof left.value === "bigint" &&
            typeof right.value === "bigint"
        ) {
            try {
                let result: bigint

                switch (operator) {
                    case "+": {
                        result = left.value + right.value
                        break
                    }
                    case "-": {
                        result = left.value - right.value
                        break
                    }
                    case "*": {
                        result = left.value * right.value
                        break
                    }
                    case "/": {
                        if (right.value === BigInt(0)) return {value: null, type: "unknown"}
                        result = left.value / right.value
                        break
                    }
                    case "%": {
                        if (right.value === BigInt(0)) return {value: null, type: "unknown"}
                        result = left.value % right.value
                        break
                    }
                    case "<<": {
                        if (right.value < 0 || right.value > 256) {
                            return {value: null, type: "unknown"}
                        }
                        result = left.value << right.value
                        break
                    }
                    case ">>": {
                        if (right.value < 0 || right.value > 256)
                            return {value: null, type: "unknown"}
                        result = left.value >> right.value
                        break
                    }
                    case "&": {
                        result = left.value & right.value
                        break
                    }
                    case "|": {
                        result = left.value | right.value
                        break
                    }
                    case "^": {
                        result = left.value ^ right.value
                        break
                    }
                    default: {
                        return this.applyComparisonOperator(operator, left, right)
                    }
                }

                const max257bit = (BigInt(1) << BigInt(256)) - BigInt(1)
                const min257bit = -(BigInt(1) << BigInt(256))

                if (result > max257bit || result < min257bit) {
                    // out of scope
                    return {value: null, type: "unknown"}
                }

                return {value: result, type: "int"}
            } catch {
                return {value: null, type: "unknown"}
            }
        }

        if (operator === "&&") {
            const leftBool = this.toBool(left)
            const rightBool = this.toBool(right)
            if (leftBool !== null && rightBool !== null) {
                return {value: leftBool && rightBool, type: "bool"}
            }
        }

        if (operator === "||") {
            const leftBool = this.toBool(left)
            const rightBool = this.toBool(right)
            if (leftBool !== null && rightBool !== null) {
                return {value: leftBool || rightBool, type: "bool"}
            }
        }

        return this.applyComparisonOperator(operator, left, right)
    }

    private applyComparisonOperator(
        operator: string,
        left: EvaluationResult,
        right: EvaluationResult,
    ): EvaluationResult {
        switch (operator) {
            case "==": {
                return {value: this.valuesEqual(left, right), type: "bool"}
            }
            case "!=": {
                return {value: !this.valuesEqual(left, right), type: "bool"}
            }
            case "<":
            case ">":
            case "<=":
            case ">=": {
                return this.applyOrderingOperator(operator, left, right)
            }
            default: {
                return {value: null, type: "unknown"}
            }
        }
    }

    private applyOrderingOperator(
        operator: string,
        left: EvaluationResult,
        right: EvaluationResult,
    ): EvaluationResult {
        if (
            left.type === "int" &&
            right.type === "int" &&
            typeof left.value === "bigint" &&
            typeof right.value === "bigint"
        ) {
            switch (operator) {
                case "<": {
                    return {value: left.value < right.value, type: "bool"}
                }
                case ">": {
                    return {value: left.value > right.value, type: "bool"}
                }
                case "<=": {
                    return {value: left.value <= right.value, type: "bool"}
                }
                case ">=": {
                    return {value: left.value >= right.value, type: "bool"}
                }
            }
        }

        return {value: null, type: "unknown"}
    }

    private evaluateUnaryOperator(node: SyntaxNode, file: TolkFile): EvaluationResult {
        const operatorNode = node.childForFieldName("operator_name")
        const argumentNode = node.childForFieldName("argument")

        if (!operatorNode || !argumentNode) return {value: null, type: "unknown"}

        const operator = operatorNode.text
        const argument = this.evaluateExpressionImpl(argumentNode, file)

        switch (operator) {
            case "!": {
                const boolVal = this.toBool(argument)
                if (boolVal !== null) {
                    return {value: !boolVal, type: "bool"}
                }
                break
            }
            case "-": {
                if (argument.type === "int" && typeof argument.value === "bigint") {
                    const result = -argument.value
                    const min257bit = -(BigInt(1) << BigInt(256))
                    if (result >= min257bit) {
                        return {value: result, type: "int"}
                    }
                }
                break
            }
            case "+": {
                if (argument.type === "int") {
                    return argument
                }
                break
            }
            case "~": {
                if (argument.type === "int" && typeof argument.value === "bigint") {
                    return {value: ~argument.value, type: "int"}
                }
                break
            }
        }

        return {value: null, type: "unknown"}
    }

    private evaluateParenthesizedExpression(node: SyntaxNode, file: TolkFile): EvaluationResult {
        const innerNode = node.childForFieldName("inner")
        if (!innerNode) return {value: null, type: "unknown"}

        return this.evaluateExpressionImpl(innerNode, file)
    }

    private evaluateCastAsOperator(node: SyntaxNode, file: TolkFile): EvaluationResult {
        const exprNode = node.childForFieldName("expr")
        if (!exprNode) return {value: null, type: "unknown"}

        return this.evaluateExpressionImpl(exprNode, file)
    }

    private toBool(result: EvaluationResult): boolean | null {
        switch (result.type) {
            case "bool": {
                return result.value as boolean
            }
            case "int": {
                return result.value !== BigInt(0)
            }
            case "unknown": {
                return null
            }
        }

        return null
    }

    private valuesEqual(left: EvaluationResult, right: EvaluationResult): boolean {
        if (left.type !== right.type) {
            return false
        }

        return left.value === right.value
    }

    private evaluateFunctionCall(node: SyntaxNode, file: TolkFile): EvaluationResult {
        const call = new CallLike(node, file)

        const calleeNode = call.callee()

        if (!calleeNode) return {value: null, type: "unknown"}

        const functionName = calleeNode.text
        if (!compileTimeFunctions.has(functionName)) {
            return {value: null, type: "unknown"}
        }

        const args = call.arguments()
        if (args.length === 0) return {value: null, type: "unknown"}

        const firstArg = args[0]?.childForFieldName("expr")
        if (!firstArg) return {value: null, type: "unknown"}
        if (firstArg.type !== "string_literal") return {value: null, type: "unknown"}

        const stringValue = firstArg.text.slice(1, -1)

        try {
            switch (functionName) {
                case "stringCrc32": {
                    return {value: BigInt(crc32(stringValue)), type: "int"}
                }
                case "stringCrc16": {
                    return {value: BigInt(crc16(stringValue)), type: "int"}
                }
                case "stringSha256": {
                    return {value: sha256(stringValue), type: "int"}
                }
                case "stringSha256_32": {
                    return {value: BigInt(sha256_32(stringValue)), type: "int"}
                }
                case "stringToBase256": {
                    return {value: stringToBase256(stringValue), type: "int"}
                }
                default: {
                    return {value: null, type: "unknown"}
                }
            }
        } catch {
            return {value: null, type: "unknown"}
        }
    }

    public static formatValue(result: EvaluationResult): string {
        if (result.value === null) {
            return "unknown"
        }

        switch (result.type) {
            case "int": {
                const value = result.value as bigint
                if (value === 0n) {
                    return "0"
                }
                if (value >= 0 && value <= BigInt(0xff_ff_ff_ff)) {
                    return `${value} (0x${value.toString(16).toUpperCase()})`
                }
                return "0x" + value.toString(16).toUpperCase()
            }
            case "bool": {
                return result.value.toString()
            }
            case "unknown": {
                return "unknown"
            }
            default: {
                return "unknown"
            }
        }
    }
}
