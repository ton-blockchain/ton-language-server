//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio

import {DeclarationNode, NamedFieldNode, NamedNode, ParameterNode, TlbNode} from "../psi/TlbNode"
import {ScopeProcessor} from "../psi/TlbReference"
import {CompletionContext} from "@server/languages/tlb/completion/CompletionContext"
import {CompletionItem, CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"
import {ResolveState} from "@server/psi/ResolveState"
import {WeightedCompletionItem} from "@server/languages/tlb/completion/WeightedCompletionItem"

export class ReferenceCompletionProcessor implements ScopeProcessor {
    public constructor(private readonly ctx: CompletionContext) {}

    public result: Map<string, CompletionItem> = new Map()

    private allowedInContext(node: TlbNode): boolean {
        if (!this.ctx.isType) {
            return node instanceof NamedFieldNode
        }

        return true
    }

    public execute(node: TlbNode, _state: ResolveState): boolean {
        if (!(node instanceof NamedNode)) return true

        const name = node.name()
        if (name.endsWith("DummyIdentifier")) {
            return true
        }

        if (!this.allowedInContext(node)) {
            return true
        }

        if (node instanceof DeclarationNode) {
            this.addItem({
                label: name,
                kind: CompletionItemKind.Class,
                insertText: `${name}$0`,
                insertTextFormat: InsertTextFormat.Snippet,
            })
        }

        if (node instanceof NamedFieldNode) {
            this.addItem({
                label: name,
                kind: CompletionItemKind.Field,
                insertText: `${name}$0`,
                insertTextFormat: InsertTextFormat.Snippet,
            })
        }

        if (node instanceof ParameterNode) {
            const owner = node.owner()
            this.addItem({
                label: name,
                labelDetails: {
                    description: owner === undefined ? "" : `of ${owner.name()}`,
                },
                kind: CompletionItemKind.TypeParameter,
                insertText: `${name}$0`,
                insertTextFormat: InsertTextFormat.Snippet,
            })
        }

        return true
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
