//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"
import type {CompletionProvider} from "@server/languages/func/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/func/completion/CompletionContext"
import {
    CompletionResult,
    CompletionWeight,
} from "@server/languages/func/completion/WeightedCompletionItem"

export class TopLevelCompletionProvider implements CompletionProvider {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.topLevel
    }

    public addCompletion(_ctx: CompletionContext, result: CompletionResult): void {
        result.add({
            label: `#include`,
            labelDetails: {
                detail: ` "";`,
            },
            kind: CompletionItemKind.Keyword,
            insertText: `#include "$1";$0`,
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: `const`,
            labelDetails: {
                detail: " <type> FOO = <value>",
            },
            kind: CompletionItemKind.Keyword,
            insertText: "const ${1:int} ${2:FOO} = ${3:0};$0",
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: `global`,
            labelDetails: {
                detail: " <type> foo = <value>",
            },
            kind: CompletionItemKind.Keyword,
            insertText: "global ${1:int} ${2:foo};$0",
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })
    }
}
