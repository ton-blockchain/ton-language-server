//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"
import {CompletionItem, InsertTextFormat, CompletionItemKind} from "vscode-languageserver-types"
import {ScopeProcessor} from "@server/languages/func/psi/Reference"
import {NamedNode, FuncNode} from "@server/languages/func/psi/FuncNode"
import {
    Constant,
    Func,
    GlobalVariable,
    Parameter,
    TypeParameter,
} from "@server/languages/func/psi/Decls"
import {CompletionContext} from "./CompletionContext"
import {CompletionWeight, WeightedCompletionItem} from "@server/completion/WeightedCompletionItem"
import {ResolveState} from "@server/psi/ResolveState"
import {CompletionItemAdditionalInformation} from "@server/completion/CompletionItemAdditionalInformation"

export class ReferenceCompletionProcessor implements ScopeProcessor {
    public constructor(private readonly ctx: CompletionContext) {}

    public result: Map<string, CompletionItem> = new Map()

    private allowedInContext(node: FuncNode): boolean {
        if (this.ctx.isType) {
            return node instanceof TypeParameter
        }

        if (this.ctx.afterDot || this.ctx.afterTilda) {
            if (node instanceof Func) {
                return node.hasParameters()
            }
            return false
        }

        return true
    }

    public execute(node: FuncNode, state: ResolveState): boolean {
        if (!(node instanceof NamedNode)) return true

        const prefix = state.get("prefix") ?? ""
        const rawName = node.name(false)
        const name = node.name()
        if (name.endsWith("DummyIdentifier")) {
            return true
        }

        if (!this.allowedInContext(node)) {
            return true
        }

        const additionalData: CompletionItemAdditionalInformation = {
            elementFile: node.file,
            file: this.ctx.element.file,
            name: name,
            language: "func",
        }

        if (node instanceof Func) {
            // don't add `self.` prefix for global functions
            const thisPrefix = prefix

            const signature = node.signaturePresentation(true, true)
            const hasNoParams = node.parameters().length === 0

            const needSemicolon = this.needSemicolon(this.ctx.element.node)

            // We want to place the cursor in parens only if there are any parameters to write.
            // and add brackets only if they are not there yet
            const parensPart = this.ctx.beforeParen ? "" : hasNoParams ? "()" : "($1)"
            const semicolonPart = needSemicolon ? "$2;$0" : ""
            const insertText = thisPrefix + rawName + parensPart + semicolonPart

            this.addItem({
                label: thisPrefix + name,
                kind: CompletionItemKind.Function,
                labelDetails: {
                    detail: signature,
                },
                insertText: insertText,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.FUNCTION,
                data: additionalData,
            })
        } else if (node instanceof Constant) {
            const type = node.node.childForFieldName("type")
            const typeName = type?.text ?? "unknown"

            const value = node.value()

            this.addItem({
                label: name,
                kind: CompletionItemKind.Constant,
                labelDetails: {
                    detail: ": " + typeName + " = " + (value?.node.text ?? "unknown"),
                },
                insertText: rawName,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.CONSTANT,
                data: additionalData,
            })
        } else if (node instanceof GlobalVariable) {
            const type = node.node.childForFieldName("type")
            const typeName = type?.text ?? "unknown"

            this.addItem({
                label: name,
                kind: CompletionItemKind.Variable,
                labelDetails: {
                    detail: ": " + typeName,
                },
                insertText: rawName,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.GLOBAL_VARIABLE,
                data: additionalData,
            })
        } else if (node.node.type === "identifier") {
            const parent = node.node.parent
            if (!parent) return true

            if (parent.type === "catch_clause") {
                const typeName = "any"

                this.addItem({
                    label: name,
                    kind: CompletionItemKind.Variable,
                    labelDetails: {
                        description: ` ${typeName}`,
                    },
                    insertText: rawName,
                    insertTextFormat: InsertTextFormat.Snippet,
                    weight: CompletionWeight.VARIABLE,
                    data: additionalData,
                })
            }
        } else if (node.node.type === "var_declaration") {
            const type = node.node.childForFieldName("type")
            const typeName = type?.text ?? "unknown"

            this.addItem({
                label: name,
                kind: CompletionItemKind.Variable,
                labelDetails: {
                    description: ` ${typeName}`,
                },
                insertText: rawName,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.VARIABLE,
                data: additionalData,
            })
        } else if (node instanceof Parameter) {
            const parent = node.node.parent
            if (!parent) return true

            const type = node.typeNode()
            const typeName = type?.node.text ?? "unknown"

            this.addItem({
                label: name,
                kind: CompletionItemKind.Variable,
                labelDetails: {
                    description: ` ${typeName}`,
                },
                insertText: rawName,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.PARAM,
                data: additionalData,
            })
        } else if (node instanceof TypeParameter) {
            this.addItem({
                label: name,
                labelDetails: {
                    description: `type parameter`,
                },
                insertText: rawName,
                kind: CompletionItemKind.TypeParameter,
                weight: CompletionWeight.PARAM,
                data: additionalData,
            })
        } else {
            this.addItem({
                label: name,
                insertText: rawName,
                weight: CompletionWeight.LOWEST,
            })
        }

        return true
    }

    private needSemicolon(node: SyntaxNode): boolean {
        if (this.ctx.beforeSemicolon || this.ctx.beforeParen) {
            return false
        }

        if (this.ctx.isStatement) {
            return true
        }

        const parent = node.parent

        if (parent?.type === "expression_statement") {
            // just
            // ...
            // foo()
            // ...
            // in block statement
            return true
        }

        // no need for semicolon
        return false
    }

    public addItem(node: WeightedCompletionItem): void {
        if (node.label === "") return
        const lookup = this.lookupString(node)
        const prev = this.result.get(lookup)
        if (prev && prev.kind === node.kind) return
        this.result.set(lookup, node)
    }

    private lookupString(item: WeightedCompletionItem): string {
        return (item.kind ?? 1).toString() + item.label
    }
}
