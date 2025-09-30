//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"

import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"

export class ExpressionSnippetsCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.expression()
    }

    public addCompletion(_ctx: CompletionContext, result: CompletionResult): void {
        result.add({
            label: "match",
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "match (${1:condition}) {\n\t$0\n}",
            weight: CompletionWeight.SNIPPET,
        })
    }
}
