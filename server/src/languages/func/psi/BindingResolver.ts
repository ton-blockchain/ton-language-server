import type { Node as SyntaxNode } from "web-tree-sitter";
import { FuncFile } from "./FuncFile";
import { Func } from "@server/languages/func/psi/Decls";

type Binding = {
    identifier: SyntaxNode,
    producer_exp: SyntaxNode[]
}

type BindingResult = {
    lhs: SyntaxNode[],
    rhs: SyntaxNode[],
    bindings: Map<string, Binding>
}

export class FunCBindingResolver {


    protected funcMap: Map<string, Func>;
    protected bindings: Map<string, Binding>;
    constructor(file: FuncFile) {
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
                if (equalsFound) {
                    rhs.push(curChild);
                } else {
                    lhs.push(curChild);
                }
            }
        }

        let bindRes: BindingResult = {
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
        this.walkPattern(pattern, rhs[0]);

        // Copy the map for the output
        for (let [k, v] of this.bindings.entries()) {
            bindRes.bindings.set(k, v);
        }
        // Free up the map
        this.bindings.clear();
        return bindRes;
    }

    private walkPattern(pattern: SyntaxNode, value: SyntaxNode) {
        if (!pattern || pattern.type == "underscore") {
            return
        }

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
                this.bindTensor(pattern, value);
                break;
        }
    }

    private bindIdentifier(target: SyntaxNode, value: SyntaxNode) {
        this.bindings.set(target.text, {
            identifier: target,
            producer_exp: [value]
        });
    }

    private bindTensor(target: SyntaxNode, value: SyntaxNode) {
        const curValueType = value.type;
        if (curValueType == "function_application") {
            this.bindToFunctionCall(target, value);
        } else if (curValueType == "tensor_expression") {

            for (let i = 0; i < target.namedChildCount; i++) {
                const nextTarget = target.namedChildren[i];
                if (!nextTarget) {
                    continue;
                }
                const nextValue = value.namedChildren[i];
                if (!nextValue) {
                    throw new Error("Undefined value");
                }
                this.walkPattern(nextTarget, nextValue);
            }
        } else {
            throw new TypeError(`Type ${curValueType} is not yet supported!`);
        }
        /*
        switch (value.type) {
            case "function_application":
                break;
            case "tensor_expression":
                this.walkPattern(target, value);
                break;
            default:
                throw new Error(`Failed to bind tensor to ${value.type} ${target} ${value}`)
        }
        */
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
    private bindToReturnType(target: SyntaxNode, callNode: SyntaxNode, retType: SyntaxNode) {
        const targetFiltered = target.type == "tensor_vars_declaration" ? target.childrenForFieldName("vars").filter(v => v?.isNamed) : target.namedChildren;

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
                case "tuple_expression":
                    if (bindType != "tuple_type_expression") {
                        throw new Error(`Can't map ${patternType} to ${bindType}`)
                    }
                    this.bindToReturnType(pattern, callNode, bindRhs);
                    break;
                case "tensor_var_declaration":
                case "tensor_expression":
                    if (bindType !== "tensor_type") {
                        throw new Error(`Cant map ${patternType} to ${bindType}`)
                    }
                    this.bindToReturnType(pattern, callNode, bindRhs);
                    break;
                case "var_declaration":
                    this.bindIdentifier(pattern.childForFieldName("name")!, callNode);
                    break;
                case "identifier":
                    this.bindIdentifier(pattern, callNode);
                    break;
            }
        }
    }
}
