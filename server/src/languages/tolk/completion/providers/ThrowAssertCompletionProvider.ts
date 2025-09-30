//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"

import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"

export class ThrowAssertCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.isStatement
    }

    public addCompletion(_ctx: CompletionContext, result: CompletionResult): void {
        result.add({
            label: "throw",
            labelDetails: {
                detail: " EXIT_CODE",
            },
            kind: CompletionItemKind.Keyword,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "throw ${1:5};$0",
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: "assert",
            labelDetails: {
                detail: " (cond) throw EXIT_CODE",
            },
            kind: CompletionItemKind.Keyword,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "assert (${1:cond}) throw ${2:5};$0",
            weight: CompletionWeight.KEYWORD,
        })
    }
}
