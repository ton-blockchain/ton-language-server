//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"

import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"
import {parentOfType} from "@server/psi/utils"

export class AnnotationsCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.isAnnotationName
    }

    private readonly predefined: {name: string; needBraces: boolean}[] = [
        {name: "inline", needBraces: false},
        {name: "pure", needBraces: false},
        {name: "inline_ref", needBraces: false},
        {name: "noinline", needBraces: false},
        {name: "custom", needBraces: true},
    ]

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        for (const {name, needBraces} of this.predefined) {
            result.add({
                label: name,
                kind: CompletionItemKind.Event,
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: name + (needBraces ? "($0)" : ""),
                weight: CompletionWeight.SNIPPET,
            })
        }

        result.add({
            label: "deprecated",
            kind: CompletionItemKind.Event,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'deprecated("$0")',
            weight: CompletionWeight.SNIPPET,
        })

        result.add({
            label: "overflow1023_policy",
            kind: CompletionItemKind.Event,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'overflow1023_policy("${0:suppress}")',
            weight: CompletionWeight.SNIPPET,
        })

        result.add({
            label: "on_bounced_policy",
            kind: CompletionItemKind.Event,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: 'on_bounced_policy("${0:manual}")',
            weight: CompletionWeight.SNIPPET,
        })

        const insideGetMethodOrFunction = parentOfType(
            ctx.element.node,
            "get_method_declaration",
            "function_declaration",
        )
        if (insideGetMethodOrFunction) {
            result.add({
                label: "method_id",
                kind: CompletionItemKind.Event,
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: "method_id(${0:0x1})",
                weight: CompletionWeight.SNIPPET,
            })
        }
    }
}
