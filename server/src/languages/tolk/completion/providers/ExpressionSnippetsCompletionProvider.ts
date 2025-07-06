//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {CompletionProvider} from "@server/languages/tolk/completion/CompletionProvider"
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {
    CompletionResult,
    CompletionWeight,
} from "@server/languages/tolk/completion/WeightedCompletionItem"

export class ExpressionSnippetsCompletionProvider implements CompletionProvider {
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
