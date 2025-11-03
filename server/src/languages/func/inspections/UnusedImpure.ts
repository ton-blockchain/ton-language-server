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
import { FUNC_PARSED_FILES_CACHE } from "@server/files"


export class UnusedImpureInspection extends UnusedInspection implements Inspection {
    public readonly id: "unused-impure" = InspectionIds.UNUSED_IMPURE;

    private impureMap: Map<string, Func>;
    private dropableMap: Map<string, Func>;
    private resultsCache: Map<string, boolean>;
    private impureBuiltins: Set<string>;

    constructor() {
        super();
        this.resultsCache = new Map();
        this.impureMap = new Map();
        this.dropableMap = new Map();
        this.impureBuiltins = new Set([
            "throw",
            "throw_if",
            "throw_unless",
            "throw_arg",
            "throw_arg_op",
            "throw_arg_unless",
            "~dump",
            "~strdump"
        ]);
    }

    private getCallDef(call: Node, mode: 'dropable' | 'impure' = 'dropable') {
        let callDef: Func | undefined;
        const lookupMap = mode == 'dropable' ? this.dropableMap : this.impureMap;
        const callType = call.type;
        if (callType == "function_application") {
            const funcIdentifier = call.childForFieldName("callee");
            if (funcIdentifier) {
                callDef = lookupMap.get(funcIdentifier.text);
            }
        } else if (callType == "method_call") {
            const funcIdentifier = call.childForFieldName("method_name");
            if (funcIdentifier) {
                const methodName = funcIdentifier.text;
                callDef = lookupMap.get(methodName);
                if (!callDef) {
                    callDef = lookupMap.get("~" + methodName);
                }
            }
        } else {
            throw new Error(`Unsupported call type ${call}`)
        }

        return callDef;
    }
    private isImpureBuiltIn(call: Node) {
        switch (call.type) {
            case "function_application":
                return this.impureBuiltins.has(call.childForFieldName("callee")!.text);
            case "method_call":
                return this.impureBuiltins.has(call.childForFieldName("method_name")!.text);
        }
        return false;
    }

    private isCall(call: Node) {
        return call.type == "function_application" || call.type == "method_call";
    }

    private setCache(node: Node, result: boolean) {
        const cacheKey = [node.startPosition.row, node.startPosition.column, node.endPosition.row, node.endPosition.column].join(':');
        this.resultsCache.set(cacheKey, result);
    }
    private getCache(node: Node) {
        const cacheKey = [node.startPosition.row, node.startPosition.column, node.endPosition.row, node.endPosition.column].join(':');
        return this.resultsCache.get(cacheKey);
    }

    protected checkFile(file: FuncFile, diagnostics: lsp.Diagnostic[]): void {
        // Populate impure functions map
        FUNC_PARSED_FILES_CACHE.forEach(parsedFile => {
            parsedFile.getFunctions().forEach(f => {
                if (f.isImpure) {
                    this.impureMap.set(f.name(true), f);
                } else {
                    this.dropableMap.set(f.name(true), f);
                }
            });
        })
        const bindResolver = new FunCBindingResolver(file);
        RecursiveVisitor.visit(file.rootNode, (node): boolean => {
            if (!this.isCall(node)) {
                return true;
            }
            let willDrop = false;
            // Skip impure builtins calls
            if (this.isImpureBuiltIn(node)) {
                return true;
            }
            // const droppableDef = this.getCallDef(node)
            if (this.checkCallWillDrop(node, file, bindResolver)) {
                willDrop = true;
                const range = asLspRange(node);
                diagnostics.push({
                    severity: lsp.DiagnosticSeverity.Error,
                    code: 'unused-impure',
                    range,
                    message: "This call will be dropped due to lack of impure specifier!",
                    source: "func"
                })
            }
            this.setCache(node, willDrop);
            return true;
        })
    }

    private checkCallWillDrop(node: Node, file: FuncFile, bindResolver: FunCBindingResolver) {
        const cachedRes = this.getCache(node);
        if (cachedRes !== undefined) {
            return cachedRes;
        }

        const definition = this.getCallDef(node, 'dropable')

        if (!definition) {
            // If no dropable def found, check that impure is implicit just in case
            const willDrop = !(this.getCallDef(node, 'impure') || this.isImpureBuiltIn(node))
            this.setCache(node, willDrop);
            return willDrop;
        }

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
        if (!expressionParent) {
            // Could happen in incomplete code
            return false;
        }
        const parentType = expressionParent.parent.type;
        // If call is in the block_statement of any kind, it will be a child of expression_statement
        // Otherwise it is in condition block of if/while/do while
        // Or in arguments clause of other function_application/method_call
        if (parentType !== "expression_statement") {
            if (parentType == "function_application" || parentType == "method_call") {
                return this.checkCallWillDrop(expressionParent.parent, file, bindResolver)
            }
            // If  expression is in condition or return statement it will not be dropped
            return false;
        }

        // We are in the expression expression_statement
        // Bind the values from the expression
        const resolvedBinding = bindResolver.resolve(expressionParent.parent);
        // If no lvalue, non-impure call will drop
        if (resolvedBinding.bindings.size == 0) {
            return true;
        }
        // If no identifiers referenced in lvalue, means those are whole type and will be dropped
        // const affectedIdentifiers = resolvedBinding.bindings.values()

        for (let boundValue of resolvedBinding.bindings.values()) {
            // Find references to the bound variables from below the current expression.
            const references = new Referent(boundValue.identifier, file).findReferences({ limit: Infinity }).filter(
                ref => ref.node.startIndex >= expressionParent.parent.endIndex
            );
            // Has to be referenced in non impure call, conditional or return statement to not drop
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
                if (!parent) {
                    continue;
                }
                if (parent.type !== "expression_statement") {
                    let willDrop = false;
                    if (this.isCall(parent)) {
                        willDrop = this.checkCallWillDrop(parent, file, bindResolver)
                        this.setCache(parent, willDrop);
                    }
                    return willDrop;
                }
                // Check reference in method call
                const refSibling = closestNamedSibling(ref.node, 'next', (sibl => sibl.type == "method_call"))
                if (refSibling) {
                    // If this is a droppable call, go to next ref, else expression is not droppable
                    if (!this.checkCallWillDrop(refSibling, file, bindResolver)) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
}

