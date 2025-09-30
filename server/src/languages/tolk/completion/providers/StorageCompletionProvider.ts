//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"

import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"

export class StorageCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.topLevel
    }

    public addCompletion(_ctx: CompletionContext, result: CompletionResult): void {
        result.add({
            label: "storage",
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: `struct \${1:Storage} {
    $0
}

fun \${1:Storage}.load() {
    return \${1:Storage}.fromCell(contract.getData());
}

fun \${1:Storage}.save(self) {
    contract.setData(self.toCell());
}`,
            weight: CompletionWeight.SNIPPET,
        })
    }
}
