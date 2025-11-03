import type { Node as SyntaxNode } from "web-tree-sitter";
import { FuncFile } from "./FuncFile";
import { Func } from "@server/languages/func/psi/Decls";
import { Expression } from "./FuncNode";
import { closestNamedSibling } from "@server/psi/utils";

type Binding = {
    identifier: SyntaxNode,
    producer_exp: SyntaxNode[]
}

type BindingResult = {
    expression: Expression
    lhs: SyntaxNode[],
    rhs: SyntaxNode[],
    bindings: Map<string, Binding>
}

export class FunCBindingResolver {


    protected funcMap: Map<string, Func>;
    protected bindings: Map<string, Binding>;

    constructor(readonly file: FuncFile) {
        this.bindings = new Map();
        this.funcMap = new Map();

        file.getFunctions().forEach((f => {
            this.funcMap.set(f.name(), f);
        }))
    }

    resolve(expression: SyntaxNode): BindingResult {

        let lhs: SyntaxNode[] = [];
        let rhs: SyntaxNode[] = [];
        let equalsFound = false;

        for (let curChild of expression.children) {
            if (!curChild) {
                continue;
            }

            if (curChild.text == '=') {
                equalsFound = true;
                if (lhs.length == 0) {
                    throw RangeError("Equals encountered before first lhs identifier");
                }
            }
            if (curChild.isNamed) {
                // If modirying method call
                /*
                if (curChild.type == "method_call" && curChild.children[0]?.text == "~") {
                    const firstArg = closestNamedSibling(curChild, 'prev', (sibling => sibling.type == "identifier"))
                    if (firstArg) {
                        // Not really lhs, but semantically it is
                        lhs.push(firstArg)
                    }
                }
                */
                if (equalsFound) {
                    rhs.push(curChild);
                } else {
                    lhs.push(curChild);
                }
            }
        }

        let bindRes: BindingResult = {
            expression: new Expression(expression, this.file),
            lhs,
            rhs,
            bindings: new Map()
        }
        if (!equalsFound || lhs[0].type == "underscore") {
            return bindRes;
        }
        if (lhs.length > 1) {
            // Do we even need dat?
            throw new RangeError("TODO multi lhs bindings");
        }

        const pattern = lhs[0]
        this.walkPattern(pattern, rhs);

        // Copy the map for the output
        for (let [k, v] of this.bindings.entries()) {
            bindRes.bindings.set(k, v);
        }
        // Free up the map
        this.bindings.clear();
        return bindRes;
    }

    private walkPattern(pattern: SyntaxNode, value: SyntaxNode[]) {
        if (!pattern || pattern.type == "underscore") {
            return
        }

        try {
            switch (pattern.type) {
                case "identifier":
                    this.bindIdentifier(pattern, value);
                    break;
                case "local_vars_declaration":
                    const curLhs = pattern.childForFieldName("lhs");
                    if (!curLhs) {
                        throw new Error("No lhs in var declaration")
                    }
                    this.walkPattern(curLhs, value);
                    break;
                case "var_declaration":
                    this.bindIdentifier(pattern.childForFieldName("name")!, value);
                    break;
                case "tensor_vars_declaration":
                case "tensor_expression":
                case "tuple_expression":
                case "parenthesized_expression":
                case "nested_tensor_declaration":
                case "tuple_vars_declaration":
                    this.bindCollection(pattern, value);
                    break;
            }
        } catch (e) {
            console.error(`Failed to waks pattern ${e} ${pattern}, ${value}`)
        }
    }

    private bindIdentifier(target: SyntaxNode, value: SyntaxNode[], checkMethodRhs: boolean = true) {
        if (checkMethodRhs) {
            value.forEach(curNode => {
                if (curNode.type == "method_call") {
                    this.bindToMethodCall(target, curNode);
                } else {
                    // In case  calls are in tensor expressions
                    curNode.descendantsOfType("method_call").forEach(methodCall => {
                        if (methodCall) {
                            this.bindToMethodCall(target, methodCall);
                        }
                    })
                }
            })
        }
        this.bindings.set(target.text, {
            identifier: target,
            producer_exp: value
        });
    }

    private bindCollection(target: SyntaxNode, value: SyntaxNode[]) {
        if (value.length >= 2) {
            value.forEach((curNode) => {
                if (curNode.type == "method_call") {
                    this.bindToMethodCall(target, curNode);
                }
            })
        } else if (value.length == 1) {
            const curValue = value[0];
            const curValueType = curValue.type;
            if (curValueType == "function_application") {
                this.bindToFunctionCall(target, curValue);
            } else if (curValueType == "tensor_expression" || curValueType == "tuple_expression") {

                for (let i = 0; i < target.namedChildCount; i++) {
                    const nextTarget = target.namedChildren[i];
                    if (!nextTarget) {
                        continue;
                    }
                    const nextValue = curValue.namedChildren[i];
                    if (!nextValue) {
                        throw new Error(`Undefined next value ${curValue}`);
                    }
                    this.walkPattern(nextTarget, [nextValue]);
                }
            } else {
                throw new TypeError(`Type ${curValueType} is not yet supported!`);
            }
        }
    }

    private bindToMethodCall(target: SyntaxNode, value: SyntaxNode) {
        const isModifying = value.children[0]?.text == "~";
        const methodName = value.childForFieldName("method_name")!.text;
        let methodDecl = this.funcMap.get(methodName);
        if (!methodDecl) {
            // Thre could be method with ~ prefix being part of the name
            if (isModifying && methodName[0] !== "~") {
                methodDecl = this.funcMap.get("~" + methodName);
            }
        }
        if (!methodDecl) {
            throw new Error(`Failed to get method declaration ${methodName}`)
        }
        const retType = methodDecl.returnType();

        if (!retType) {
            throw new Error(`Method ${methodName} has no return type`)
        }
        if (retType.node.type !== "tensor_type") {
            throw new TypeError(`Expected tensor_type for modifying method return type got ${retType.node.type}`)
        }

        // For non-modofiying method bind as normal function call;
        let bindScope = retType.node;

        if (isModifying) {
            const firstArg = closestNamedSibling(value, 'prev', (sybl => sybl.type == "identifier"));
            if (!firstArg) {
                throw new Error(`First arg not found for modifying method call ${value}`)
            }
            this.bindIdentifier(firstArg, [value], false);
            // Next tensor type
            let retTensor: SyntaxNode | undefined;
            const childrenCount = bindScope.namedChildCount;
            // First is bound to the first method arg already
            for (let i = 1; i < childrenCount; i++) {
                const curChild = bindScope.namedChild(i);
                if (curChild?.type == "tensor_type") {
                    retTensor = curChild;
                    break;
                }
            }
            if (!retTensor) {
                throw new Error(`Return tensor not defined for method ${methodDecl}`)
            }
            // If sub tensor is empty, we can return at this point
            if (retTensor.namedChildCount == 0) {
                return;
            }
            // Otherwise bind to the sub-tensor
            bindScope = retTensor;
        }

        this.bindToReturnType(target, value, bindScope, false)
    }
    private bindToFunctionCall(target: SyntaxNode, value: SyntaxNode) {
        const funcIdentifier = value.childForFieldName("callee");
        if (!funcIdentifier) {
            throw new Error(`Calle not found: ${value}`)
        }
        const funcName = funcIdentifier.text;
        const funcDecl = this.funcMap.get(funcName);
        if (!funcDecl) {
            throw new Error(`Failed to find function declaration ${funcName}`)
        }
        const retType = funcDecl.returnType();
        if (!retType) {
            throw new Error(`Function ${funcName} without return type. Grammar failure?`)
        }
        this.bindToReturnType(target, value, retType.node);

    }
    private bindToReturnType(target: SyntaxNode, callNode: SyntaxNode, retType: SyntaxNode, checkMethodRhs: boolean = true) {
        const targetType = target.type;
        let targetFiltered: (SyntaxNode | null)[];
        // Hacky,but drop types
        if (targetType == "tensor_vars_declaration") {
            targetFiltered = target.childrenForFieldName("vars").filter(v => v?.isNamed);
        } else if (targetType == "var_declaration" || targetType == "identifier") {
            // Name is only part of var declaration
            const identifierNode = target.childForFieldName("name") ?? target;
            this.bindIdentifier(identifierNode, [callNode], checkMethodRhs);
            return;
        } else {
            targetFiltered = target.namedChildren;
        }

        if (targetFiltered.length != retType.namedChildCount) {
            throw new Error(`Return type arity error ${target} ${retType}`);
        }

        for (let i = 0; i < targetFiltered.length; i++) {
            const pattern = targetFiltered[i];
            const bindRhs = retType.namedChildren[i];

            if (pattern == null || pattern.type == "underscore") {
                continue;
            }
            if (!bindRhs) {
                throw new Error(`Type node can't be null`)
            }

            const bindType = bindRhs.type;
            const patternType = pattern.type;

            switch (patternType) {
                case "tuple_vars_declaration":
                case "tuple_expression":
                    if (bindType != "tuple_type") {
                        throw new Error(`Can't map ${patternType} to ${bindType}`)
                    }
                    this.bindToReturnType(pattern, callNode, bindRhs, checkMethodRhs);
                    break;
                case "local_vars_declaration":
                    this.bindToReturnType(pattern.childForFieldName("lhs")!, callNode, bindRhs, checkMethodRhs);
                    break;
                case "tensor_var_declaration":
                case "nested_tensor_declaration":
                case "tensor_expression":
                    if (bindType !== "tensor_type") {
                        throw new Error(`Cant map ${patternType} to ${bindType}`)
                    }
                    this.bindToReturnType(pattern, callNode, bindRhs, checkMethodRhs);
                    break;
                case "var_declaration":
                    this.bindIdentifier(pattern.childForFieldName("name")!, [callNode], checkMethodRhs);
                    break;
                case "identifier":
                    this.bindIdentifier(pattern, [callNode], checkMethodRhs);
                    break;
            }
        }
    }
}
