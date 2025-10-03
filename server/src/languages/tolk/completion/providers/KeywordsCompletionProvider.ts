//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {CompletionItemKind} from "vscode-languageserver-types"

import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"

export class KeywordsCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.expression() && !ctx.inNameOfFieldInit
    }

    private readonly keywordWithSpace: string[] = ["lazy", "as", "is", "mutate"]

    public addCompletion(_ctx: CompletionContext, result: CompletionResult): void {
        result.add({
            label: "true",
            kind: CompletionItemKind.Keyword,
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: "false",
            kind: CompletionItemKind.Keyword,
            weight: CompletionWeight.KEYWORD,
        })

        for (const keyword of this.keywordWithSpace) {
            result.add({
                label: keyword,
                insertText: `${keyword} `,
                kind: CompletionItemKind.Keyword,
                weight: CompletionWeight.KEYWORD,
            })
        }
    }
}
