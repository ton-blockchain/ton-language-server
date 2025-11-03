//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core

import * as lsp from "vscode-languageserver"

import type { FuncFile } from "@server/languages/func/psi/FuncFile"
import { Node } from 'web-tree-sitter'
import { UnusedInspection } from "./UnusedInspection"
import { Inspection, InspectionIds } from "./Inspection"
import { RecursiveVisitor } from "@server/visitor/visitor";
import { Func } from "@server/languages/func/psi/Decls";
import { asLspRange } from "@server/utils/position"
import { closestNamedSibling, parentOfType, parentOfTypeWithCb } from "@server/psi/utils"
import { Referent } from "@server/languages/func/psi/Referent"
import { FunCBindingResolver } from "../psi/BindingResolver"


export class UnusedImpureInspection extends UnusedInspection implements Inspection {
    public readonly id: "unused-impure" = InspectionIds.UNUSED_IMPURE;

    protected checkFile(file: FuncFile, diagnostics: lsp.Diagnostic[]): void {
        const impureMap: Map<string, Func> = new Map();
        // Populate impure functions map
        file.getFunctions().forEach(f => {
            if (!f.isImpure) {
                impureMap.set(f.name(true), f);
            }
        });
        const bindResolver = new FunCBindingResolver(file);
        RecursiveVisitor.visit(file.rootNode, (node): boolean => {
            let droppableDef: Func | undefined;

            if (node.type == "function_application") {
                const funcIdentifier = node.childForFieldName("callee");
                if (funcIdentifier) {
                    droppableDef = impureMap.get(funcIdentifier.text);
                }
            } else if (node.type == "method_call") {
                const funcIdentifier = node.childForFieldName("method_name");
                if (funcIdentifier) {
                    const methodName = funcIdentifier.text;
                    droppableDef = impureMap.get(methodName);
                    if (!droppableDef) {
                        droppableDef = impureMap.get("~" + methodName);
                    }
                }
            }

            if (droppableDef && this.checkCallWillDrop(node, droppableDef, file, bindResolver)) {
                const range = asLspRange(node);
                diagnostics.push({
                    severity: lsp.DiagnosticSeverity.Error,
                    range,
                    message: "This call will be dropped due to lack of impure specifier!",
                    source: "func"
                })
            }
            return true;
        })
    }

    private checkCallWillDrop(node: Node, definition: Func, file: FuncFile, bindResolver: FunCBindingResolver) {
        const returnExp = definition.returnType();
        if (returnExp !== null) {
            // If return type of a function is empty tensor - check  no more.
            if (returnExp.node.text == '()') {
                return true;
            }
        }
        const expressionParent = parentOfTypeWithCb<{ parent: Node, origin: Node }>(node,
            (parent, origin) => {
                return { parent, origin }
            },
            "expression_statement",
            "return_statement",
            "function_application",
            "method_call",
            "if_statement",
            "while_statement",
            "do_while_statement",
            "repeat_statement",
            "return_statement"
        );
        // If call is in the block_statement of any kind, it will be a child of expression_statement
        // Otherwise it is in condition block of if/while/do while
        // Or in arguments clause of other function_application/method_call
        if (!expressionParent || expressionParent.parent.type !== "expression_statement") {
            // If  expression is in condition or return statement it will not be dropped
            return false;
        }

        // We are in the expression expression_statement
        // Closest previous sibling got to be lvalue expression
        // (identifier/tensor_expression/tuple_expression)
        const resolvedBinding = bindResolver.resolve(expressionParent.parent);
        // If no lvalue, non-impure call will drop
        if (resolvedBinding.bindings.size == 0) {
            return true;
        }
        // If no identifiers referenced in lvalue, means those are whole type and will be dropped
        // const affectedIdentifiers = resolvedBinding.bindings.values()

        for (let refValue of resolvedBinding.bindings.values()) {
            if (!refValue) {
                continue;
            }
            const references = new Referent(refValue.identifier, file).findReferences({}) // we need at least one reference
            // Has to be referenced in call, conditional or return statement;
            for (let ref of references) {
                const parent = parentOfType(ref.node,
                    "expression_statement", // But don't go above expression_statement
                    "function_application",
                    "method_call",
                    "if_statement",
                    "while_statement",
                    "do_while_statement",
                    "repeat_statement",
                    "return_statement"
                )
                if (parent && parent.type !== "expression_statement") {
                    return false;
                }
            }
        }

        return true;
    }
}

