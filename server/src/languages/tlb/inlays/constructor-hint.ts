//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core

import * as lsp from "vscode-languageserver-types"
import type {Node as SyntaxNode} from "web-tree-sitter"

import {crc32} from "@server/utils/crc32"

import {FileDiff} from "@server/utils/FileDiff"
import {TlbFile} from "@server/languages/tlb/psi/TlbFile"

import {ConstructorTag} from "./constructor-tag"

function printConstructor(
    constructorNode: SyntaxNode,
    skipTag: boolean,
    showBraces: boolean,
): string {
    let decl: SyntaxNode | null = constructorNode
    while (decl && decl.type !== "declaration") {
        decl = decl.parent
    }

    if (!decl) return ""

    const constructor = decl.childForFieldName("constructor")
    const combinator = decl.childForFieldName("combinator")

    if (!constructor || !combinator) return ""

    const nameNode = constructor.childForFieldName("name")
    const name = nameNode ? nameNode.text : ""

    let result = name

    if (!skipTag) {
        const tagNode = constructor.childForFieldName("tag")
        if (tagNode) {
            result += tagNode.text
        }
    }

    const fields: string[] = []
    for (const child of decl.namedChildren) {
        if (child?.type === "field") {
            fields.push(printField(child, showBraces))
        }
    }

    if (fields.length > 0) {
        result += ` ${fields.join(" ")}`
    }

    result += " = "

    const combinatorNameNode = combinator.childForFieldName("name")
    const combinatorName = combinatorNameNode ? combinatorNameNode.text : ""

    result += combinatorName

    const params: string[] = []
    for (const param of combinator.childrenForFieldName("params")) {
        if (!param) continue
        params.push(printTypeExpression(param, 100, !showBraces, false))
    }

    if (params.length > 0) {
        result += ` ${params.join(" ")}`
    }

    return result
}

function printField(fieldNode: SyntaxNode, showBraces: boolean): string {
    const fieldChild = fieldNode.namedChildren[0]
    if (!fieldChild) return fieldNode.text

    switch (fieldChild.type) {
        case "field_builtin": {
            // field_builtin: {name : builtin_field}
            const nameNode = fieldChild.childForFieldName("name")
            const builtinFieldNode = fieldChild.childForFieldName("field")

            if (nameNode && builtinFieldNode) {
                let result = showBraces ? "{" : ""
                result += nameNode.text
                result += ":"
                result += builtinFieldNode.text
                result += showBraces ? "}" : ""
                return result
            }
            break
        }

        case "field_curly_expr": {
            // field_curly_expr: {curly_expression?}
            const curlyExpr = fieldChild.childForFieldName("expr")
            if (curlyExpr) {
                return printTypeExpression(curlyExpr, 0, !showBraces, true)
            }
            break
        }

        case "field_named": {
            // field_named: name : cond_expr
            const nameNode = fieldChild.childForFieldName("name")
            const exprNode = fieldChild.childForFieldName("expr")

            if (nameNode && exprNode) {
                return `${nameNode.text}:${printTypeExpression(exprNode, 0, !showBraces, false)}`
            }
            break
        }

        case "field_expr": {
            // field_expr: cond_expr
            const exprNode = fieldChild.namedChildren[0]
            if (exprNode) {
                return printTypeExpression(exprNode, 0, showBraces, false)
            }
            break
        }
    }

    return fieldNode.text
}

function printTypeExpression(
    node: SyntaxNode,
    priority: number,
    skipParens: boolean,
    normalizeBinExpr: boolean,
): string {
    const type = node.type

    if (priority > 0 && skipParens) {
        return printTypeExpression(node, 0, true, normalizeBinExpr)
    }

    switch (type) {
        case "field": {
            return printField(node, !skipParens)
        }

        case "type_expr": {
            const child = node.namedChildren[0]
            return child ? printTypeExpression(child, priority, skipParens, normalizeBinExpr) : ""
        }

        case "simple_expr": {
            const child = node.namedChildren[0]
            return child ? printTypeExpression(child, priority, skipParens, normalizeBinExpr) : ""
        }

        case "ref_expr": {
            const child = node.namedChildren[0]
            return child ? printTypeExpression(child, priority, skipParens, normalizeBinExpr) : ""
        }

        case "ref_inner": {
            // ref_inner can be either type_identifier or number
            const child = node.namedChildren[0]
            return child ? child.text : ""
        }

        case "type_identifier": {
            return node.text
        }

        case "number": {
            return node.text
        }

        case "type_parameter": {
            // type_parameter: simple_expr
            const child = node.namedChildren[0]
            return child ? printTypeExpression(child, priority, skipParens, normalizeBinExpr) : ""
        }

        case "binary_expression": {
            const left = node.childForFieldName("left")
            const right = node.childForFieldName("right")
            const operator = node.childForFieldName("operator")

            if (!left || !right || !operator) return ""

            let opText = operator.text
            let leftExpr = left
            let rightExpr = right

            if (opText === ">=") {
                opText = "<="
            } else if (opText === ">") {
                opText = "<"
            }

            if (
                !normalizeBinExpr &&
                rightExpr.children[0]?.children?.[0]?.children?.[0]?.type === "number"
            ) {
                ;[leftExpr, rightExpr] = [rightExpr, leftExpr]
            }

            let resultPriority = 0
            let showParens = false

            if (opText === "+") {
                resultPriority = 21
                showParens = priority > 21
            } else if (opText === "*") {
                resultPriority = 30
                showParens = priority > 30
            } else {
                resultPriority = 0
            }

            const leftString = printTypeExpression(
                rightExpr,
                resultPriority + 1,
                skipParens,
                normalizeBinExpr,
            )
            const rightString = printTypeExpression(
                leftExpr,
                resultPriority,
                skipParens,
                normalizeBinExpr,
            )

            const baseString = normalizeBinExpr
                ? `${opText} ${leftString} ${rightString}`
                : `${rightString} ${opText} ${leftString}`

            return showParens ? `(${baseString})` : baseString
        }

        case "array_type": {
            const elementType = node.childForFieldName("element_type")
            if (!elementType) return ""
            const elementText = printTypeExpression(
                elementType,
                priority,
                skipParens,
                normalizeBinExpr,
            )
            return `[${elementText}]`
        }

        case "cell_ref_expr": {
            const inner = node.childForFieldName("expr")
            if (!inner) return ""
            const innerText = printTypeExpression(inner, 100, skipParens, normalizeBinExpr)
            return `^${innerText}`
        }

        case "cell_ref_inner": {
            const child = node.namedChildren[0]
            return child ? printTypeExpression(child, priority, skipParens, normalizeBinExpr) : ""
        }

        case "combinator_expr": {
            const name = node.childForFieldName("name")
            const params = node.childrenForFieldName("params")

            if (!name) return ""

            let result = name.text
            const showParens = priority > 90 && params.length > 0
            if (showParens) result = `(${result}`

            for (const param of params) {
                if (param) {
                    result += ` ${printTypeExpression(param, 91, skipParens, normalizeBinExpr)}`
                }
            }

            if (showParens) result += `)`
            return result
        }

        case "cond_type_expr": {
            const child = node.namedChildren[0]
            return child ? printTypeExpression(child, priority, skipParens, normalizeBinExpr) : ""
        }

        case "cond_question_expr": {
            const left = node.namedChildren[0]
            const right = node.namedChildren[1]

            if (!left || !right) return ""

            const showParens = priority > 95
            const leftText = printTypeExpression(left, 96, skipParens, normalizeBinExpr)
            const rightText = printTypeExpression(right, 96, skipParens, normalizeBinExpr)

            return showParens ? `(${leftText} ? ${rightText})` : `${leftText} ? ${rightText}`
        }

        case "cond_dot_and_question_expr": {
            const dotted = node.namedChildren[0]
            const questionType = node.namedChildren[1]

            if (!dotted || !questionType) return ""

            const dottedText = printTypeExpression(dotted, priority, skipParens, normalizeBinExpr)
            const questionText = printTypeExpression(
                questionType,
                priority,
                skipParens,
                normalizeBinExpr,
            )
            return `${dottedText} ? ${questionText}`
        }

        case "cond_dotted": {
            const typeExpr = node.namedChildren[0]
            const number = node.namedChildren[1]

            if (!typeExpr || !number) return ""

            const showParens = priority > 97
            const typeText = printTypeExpression(typeExpr, 98, skipParens, normalizeBinExpr)
            const numberText = number.text

            return showParens ? `(${typeText}.${numberText})` : `${typeText}.${numberText}`
        }

        case "builtin_expr": {
            const child = node.namedChildren[0]
            return child ? printTypeExpression(child, priority, skipParens, normalizeBinExpr) : ""
        }

        case "builtin_zero_args": {
            return "#"
        }

        case "builtin_one_arg": {
            const op = node.childForFieldName("operator")
            const expr = node.childForFieldName("expr")

            if (!op || !expr) return ""

            const opText = op.text
            const exprText = printTypeExpression(expr, priority, skipParens, normalizeBinExpr)
            const baseText = `${opText} ${exprText}`
            return skipParens ? baseText : `(${baseText})`
        }

        case "negate_expr": {
            const operand = node.childForFieldName("operand")
            if (!operand) return ""
            const operandText = printTypeExpression(operand, priority, skipParens, normalizeBinExpr)
            return `~${operandText}`
        }

        case "bit_size_expr": {
            const size = node.childForFieldName("size")
            if (!size) return ""
            const sizeText = printTypeExpression(size, priority, skipParens, normalizeBinExpr)
            return `## ${sizeText}`
        }

        case "parens_expr":
        case "parens_type_expr": {
            const child = node.namedChildren[0]
            return child ? printTypeExpression(child, priority, skipParens, normalizeBinExpr) : ""
        }

        case "array_multiplier": {
            const size = node.childForFieldName("size")
            const arrayType = node.childForFieldName("type")

            if (!size || !arrayType) return ""

            const sizeText = printTypeExpression(size, priority, skipParens, normalizeBinExpr)
            const arrayText = printTypeExpression(arrayType, priority, skipParens, normalizeBinExpr)
            return `${sizeText} * ${arrayText}`
        }

        case "parens_compare_expr": {
            // parens_compare_expr: (compare_expr)
            const child = node.namedChildren[0]
            return child ? printTypeExpression(child, priority, skipParens, normalizeBinExpr) : ""
        }

        case "compare_expr": {
            // compare_expr: binary_expression | parens_compare_expr
            const child = node.namedChildren[0]
            return child ? printTypeExpression(child, priority, skipParens, normalizeBinExpr) : ""
        }

        case "cond_expr": {
            // cond_expr: cond_dot_and_question_expr | cond_question_expr | cond_type_expr
            const child = node.namedChildren[0]
            return child ? printTypeExpression(child, priority, skipParens, normalizeBinExpr) : ""
        }

        case "curly_expression": {
            // curly_expression: compare_expr | identifier
            // Print with braces if not skipping parens
            const child = node.namedChildren[0]
            const inner = child
                ? printTypeExpression(child, priority, skipParens, normalizeBinExpr)
                : ""
            return skipParens ? inner : `{${inner}}`
        }

        case "identifier": {
            return node.text.trim()
        }

        default: {
            return node.text.trim()
        }
    }
}

export function constructorHint(
    constructorNode: SyntaxNode,
    file: TlbFile,
    result: lsp.InlayHint[],
): void {
    const tagNode = constructorNode.childForFieldName("tag")
    if (tagNode !== null) {
        return
    }

    const equation = printConstructor(constructorNode, true, false)
    if (!equation) return

    const hash = crc32(equation)
    const tagValue = (BigInt(hash) << 32n) | 0x80000000n

    const tag = new ConstructorTag(tagValue)

    const nameNode = constructorNode.childForFieldName("name")
    const position = nameNode
        ? {
              line: nameNode.endPosition.row,
              character: nameNode.endPosition.column,
          }
        : {
              line: constructorNode.startPosition.row,
              character: constructorNode.startPosition.column,
          }

    const diff = FileDiff.forFile(file.uri)
    diff.appendTo(position, tag.toString())

    const hint: lsp.InlayHint = {
        position,
        label: tag.toString(),
        kind: lsp.InlayHintKind.Type,
        paddingLeft: false,
        paddingRight: true,
        textEdits: diff.toTextEdits(),
    }

    result.push(hint)
}
