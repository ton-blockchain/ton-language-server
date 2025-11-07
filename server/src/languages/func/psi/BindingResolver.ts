import type {Node as SyntaxNode} from "web-tree-sitter"

import {Func} from "@server/languages/func/psi/Decls"

import {closestNamedSibling} from "@server/psi/utils"
import {FUNC_PARSED_FILES_CACHE} from "@server/files"

import {Expression} from "./FuncNode"
import {FuncFile} from "./FuncFile"

interface Binding {
    readonly identifier: SyntaxNode
    readonly producer_exp: SyntaxNode[]
}

interface BindingResult {
    readonly expression: Expression
    readonly lhs: SyntaxNode[]
    readonly rhs: SyntaxNode[]
    readonly bindings: Map<string, Binding>
}

export class FunCBindingResolver {
    protected funcMap: Map<string, Func>
    protected bindings: Map<string, Binding>
    protected assignmentOps: Set<string>

    public constructor(protected readonly file: FuncFile) {
        this.bindings = new Map()
        this.funcMap = new Map()
        this.assignmentOps = new Set([
            "=",
            "+=",
            "-=",
            "*=",
            "/=",
            "~/=",
            "^/=",
            "%=",
            "~%=",
            "^%=",
            "<<=",
            ">>=",
            "~>>=",
            "^>>=",
            "&=",
            "|=",
            "^=",
        ])

        FUNC_PARSED_FILES_CACHE.forEach(parsedFile => {
            parsedFile.getFunctions().forEach(f => {
                this.funcMap.set(f.name(), f)
            })
        })
    }

    public resolve(expression: SyntaxNode): BindingResult {
        const lhs: SyntaxNode[] = []
        const rhs: SyntaxNode[] = []
        let equalsFound = false

        for (const curChild of expression.children) {
            if (!curChild) {
                continue
            }

            if (this.assignmentOps.has(curChild.text)) {
                equalsFound = true
                if (lhs.length === 0) {
                    throw new RangeError("Equals encountered before first lhs identifier")
                }
            }
            if (curChild.isNamed) {
                if (equalsFound) {
                    rhs.push(curChild)
                } else {
                    lhs.push(curChild)
                }
            }
        }

        const bindRes: BindingResult = {
            expression: new Expression(expression, this.file),
            lhs,
            rhs,
            bindings: new Map(),
        }
        if (lhs[0].type == "underscore") {
            return bindRes
        }
        if (lhs.length > 1 && rhs.length > 0) {
            // Do we even need dat?
            throw new RangeError("TODO multi lhs bindings")
        }

        const pattern = lhs[0]
        if (rhs.length > 0) {
            this.walkPattern(pattern, rhs)
        } else {
            // Without rhs there still may be method calls on left.
            // ds~skip_bits(32); ;; Stuff like that
            this.bindModifyingCalls(lhs)
        }

        // Copy the map for the output
        for (const [k, v] of this.bindings.entries()) {
            bindRes.bindings.set(k, v)
        }
        // Free up the map
        this.bindings.clear()
        return bindRes
    }

    protected walkPattern(pattern: SyntaxNode, value: SyntaxNode[]): void {
        if (pattern.type == "underscore") {
            return
        }

        try {
            switch (pattern.type) {
                case "identifier": {
                    this.bindIdentifier(pattern, value)
                    break
                }
                case "local_vars_declaration": {
                    const curLhs = pattern.childForFieldName("lhs")
                    if (!curLhs) {
                        throw new Error("No lhs in var declaration")
                    }
                    this.walkPattern(curLhs, value)
                    break
                }
                case "var_declaration": {
                    const idName = pattern.childForFieldName("name")
                    if (idName) {
                        this.bindIdentifier(idName, value)
                    }
                    break
                }
                case "tensor_vars_declaration":
                case "tensor_expression":
                case "typed_tuple":
                case "parenthesized_expression":
                case "nested_tensor_declaration":
                case "grouped_expression":
                case "tuple_vars_declaration": {
                    this.bindCollection(pattern, value)
                    break
                }
            }
        } catch (error) {
            console.error(
                `Failed to waks pattern ${error} ${pattern.toString()}, ${value.join("")}`,
            )
        }
    }

    protected bindModifyingCalls(value: SyntaxNode[]): void {
        value.forEach(curNode => {
            if (curNode.type == "method_call") {
                // Only modifying calls
                if (curNode.children[0]?.text == "~") {
                    const identifier = curNode.previousNamedSibling
                    if (identifier && identifier.type == "identifier") {
                        this.bindToMethodCall(identifier, curNode)
                    }
                }
            } else {
                // In case  calls are in tensor expressions
                curNode.descendantsOfType("method_call").forEach(methodCall => {
                    if (methodCall && methodCall.children[0]?.text == "~") {
                        const identifier = curNode.previousNamedSibling
                        if (identifier && identifier.type == "identifier") {
                            this.bindToMethodCall(identifier, curNode)
                        }
                    }
                })
            }
        })
    }
    protected bindIdentifier(
        target: SyntaxNode,
        value: SyntaxNode[],
        checkMethodRhs: boolean = true,
    ): void {
        if (checkMethodRhs) {
            this.bindModifyingCalls(value)
        }
        this.bindings.set(target.text, {
            identifier: target,
            producer_exp: value,
        })
    }

    private bindCollection(target: SyntaxNode, value: SyntaxNode[]): void {
        if (value.length >= 2) {
            value.forEach(curNode => {
                if (curNode.type == "method_call") {
                    this.bindToMethodCall(target, curNode)
                }
            })
        } else if (value.length == 1) {
            const curValue = value[0]
            const curValueType = curValue.type
            if (curValueType == "function_application") {
                this.bindToFunctionCall(target, curValue)
                return
            }
            const filteredTarget =
                target.type == "tensor_vars_declaration" || target.type == "tuple_vars_declaration"
                    ? target.childrenForFieldName("vars").filter(c => c?.isNamed)
                    : target.namedChildren
            if (filteredTarget.length != curValue.namedChildCount) {
                throw new Error(
                    `Arity error binding ${target.toString()} to ${curValue.toString()}`,
                )
            }
            for (const [i, nextTarget] of filteredTarget.entries()) {
                const actualTarget =
                    nextTarget?.type == "grouped_expression"
                        ? nextTarget.firstNamedChild
                        : nextTarget
                if (!actualTarget) {
                    continue
                }

                const nextValue = curValue.namedChildren[i]
                const actualValue =
                    nextValue?.type == "grouped_expression" ? nextValue.firstNamedChild : nextValue
                if (!actualValue) {
                    throw new Error(`Undefined next value ${curValue.toString()}`)
                }

                this.walkPattern(actualTarget, [actualValue])
            }
            /*
            } else {
                throw new TypeError(`Type ${curValueType} is not yet supported!`)
            }
            */
        }
    }

    private bindToMethodCall(target: SyntaxNode, value: SyntaxNode): void {
        const isModifying = value.children[0]?.text == "~"
        const methodName = value.childForFieldName("method_name")?.text
        if (!methodName) {
            throw new Error(`Failed to find method name for ${value.toString()}`)
        }
        let methodDecl = this.funcMap.get(methodName)
        if (!methodDecl) {
            // Thre could be method with ~ prefix being part of the name
            if (isModifying && !methodName.startsWith("~")) {
                methodDecl = this.funcMap.get("~" + methodName)
            }
        }
        if (!methodDecl) {
            throw new Error(`Failed to get method declaration ${methodName}`)
        }
        const retType = methodDecl.returnType()

        if (!retType) {
            throw new Error(`Method ${methodName} has no return type`)
        }

        // For non-modofiying method bind as normal function call;
        let bindScope = retType.node

        if (isModifying) {
            if (retType.node.type !== "tensor_type") {
                throw new TypeError(
                    `Expected tensor_type for modifying method return type got ${retType.node.type}`,
                )
            }

            const firstArg = closestNamedSibling(value, "prev", sybl => sybl.type == "identifier")
            if (!firstArg) {
                throw new Error(`First arg not found for modifying method call ${value.toString()}`)
            }
            this.bindIdentifier(firstArg, [value], false)
            // If firstArg is same as target, we're done here.
            if (firstArg.id == target.id) {
                return
            }

            // Next tensor type
            let retTensor: SyntaxNode | undefined
            const childrenCount = bindScope.namedChildCount
            // First is bound to the first method arg already
            for (let i = 1; i < childrenCount; i++) {
                const curChild = bindScope.namedChild(i)
                if (!curChild) {
                    continue
                }
                const childType = curChild.type
                if (childType == "primitive_type") {
                    this.bindIdentifier(curChild, [value], false)
                    return
                }
                if (childType == "tensor_type" || childType == "tuple_type") {
                    retTensor = curChild
                    break
                }
            }
            if (!retTensor) {
                throw new Error(
                    `Return tensor not defined for method ${methodDecl.node.toString()}`,
                )
            }
            // If sub tensor is empty, we can return at this point
            if (retTensor.namedChildCount == 0) {
                return
            }
            // Otherwise bind to the sub-tensor
            bindScope = retTensor
        }

        this.bindToReturnType(target, value, bindScope, false)
    }
    private bindToFunctionCall(target: SyntaxNode, value: SyntaxNode): void {
        const funcIdentifier = value.childForFieldName("callee")
        if (!funcIdentifier) {
            throw new Error(`Calle not found: ${value.toString()}`)
        }
        const funcName = funcIdentifier.text
        const funcDecl = this.funcMap.get(funcName)
        if (!funcDecl) {
            throw new Error(`Failed to find function declaration ${funcName}`)
        }
        const retType = funcDecl.returnType()
        if (!retType) {
            throw new Error(`Function ${funcName} without return type. Grammar failure?`)
        }
        this.bindToReturnType(target, value, retType.node)
    }
    private bindToReturnType(
        target: SyntaxNode,
        callNode: SyntaxNode,
        retType: SyntaxNode,
        checkMethodRhs: boolean = true,
    ): void {
        const targetType = target.type
        let targetFiltered: (SyntaxNode | null)[]
        // Hacky,but drop types
        if (targetType == "tensor_vars_declaration" || targetType == "tuple_vars_declaration") {
            targetFiltered = target.childrenForFieldName("vars").filter(v => v?.isNamed)
        } else if (targetType == "var_declaration" || targetType == "identifier") {
            // Name is only part of var declaration
            const identifierNode = target.childForFieldName("name") ?? target
            this.bindIdentifier(identifierNode, [callNode], checkMethodRhs)
            return
        } else if (targetType == "grouped_expression") {
            targetFiltered = target.firstNamedChild?.namedChildren ?? []
        } else {
            targetFiltered = target.namedChildren
        }

        if (targetFiltered.length != retType.namedChildCount) {
            if (targetFiltered.length == 1 && retType.type == "primitive_type") {
                const targetNode = targetFiltered[0]
                if (targetNode) {
                    this.bindIdentifier(targetNode, [callNode], checkMethodRhs)
                    return
                }
            }
            throw new Error(`Return type arity error ${target.toString()} ${retType.toString()}`)
        }

        for (const [i, pattern] of targetFiltered.entries()) {
            const bindRhs = retType.namedChildren[i]

            if (pattern == null || pattern.type == "underscore") {
                continue
            }
            if (!bindRhs) {
                throw new Error(`Type node can't be null`)
            }

            const bindType = bindRhs.type
            const patternType = pattern.type

            switch (patternType) {
                case "tuple_vars_declaration":
                case "tuple_expression": {
                    if (bindType != "tuple_type") {
                        throw new Error(`Can't map ${patternType} to ${bindType}`)
                    }
                    this.bindToReturnType(pattern, callNode, bindRhs, checkMethodRhs)
                    break
                }
                case "local_vars_declaration": {
                    const lhs = pattern.childForFieldName("lhs")
                    if (!lhs) {
                        throw new Error(`No lhs in local_vars_declaration. Broken grammar`)
                    }
                    this.bindToReturnType(lhs, callNode, bindRhs, checkMethodRhs)
                    break
                }
                case "grouped_expression": {
                    const nextChild = pattern.firstNamedChild
                    if (!nextChild) {
                        throw new Error("No child for grouped_expression. Borken grammar")
                    }
                    this.bindToReturnType(nextChild, callNode, bindRhs)
                    break
                }
                case "tensor_var_declaration":
                case "nested_tensor_declaration":
                case "tensor_expression": {
                    if (bindType !== "tensor_type") {
                        throw new Error(`Cant map ${patternType} to ${bindType}`)
                    }
                    this.bindToReturnType(pattern, callNode, bindRhs, checkMethodRhs)
                    break
                }
                case "var_declaration": {
                    const varName = pattern.childForFieldName("name")
                    if (!varName) {
                        throw new Error(
                            `No variable name in var_declaration. Broken grammar ${pattern.toString()}`,
                        )
                    }
                    this.bindIdentifier(varName, [callNode], checkMethodRhs)
                    break
                }
                case "identifier": {
                    this.bindIdentifier(pattern, [callNode], checkMethodRhs)
                    break
                }
            }
        }
    }
}
