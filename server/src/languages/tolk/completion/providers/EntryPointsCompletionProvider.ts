//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"
import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"

export class EntryPointsCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.topLevel
    }

    public addCompletion(_ctx: CompletionContext, result: CompletionResult): void {
        result.add({
            label: `onInternalMessage`,
            kind: CompletionItemKind.Snippet,
            insertText: `fun onInternalMessage(in: InMessage) {$0}`,
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })
        result.add({
            label: `onBouncedMessage`,
            kind: CompletionItemKind.Snippet,
            insertText: `fun onInternalMessage(in: InMessageBounced) {$0}`,
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })
        result.add({
            label: `onExternalMessage`,
            kind: CompletionItemKind.Snippet,
            insertText: `fun onExternalMessage(inMsg: slice) {$0}`,
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })
        result.add({
            label: `onTickTock`,
            kind: CompletionItemKind.Snippet,
            insertText: `fun onTickTock(isTock: bool) {$0}`,
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })
    }
}
