//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {CompletionProvider} from "@server/languages/tolk/completion/CompletionProvider"
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {
    CompletionResult,
    CompletionWeight,
} from "@server/languages/tolk/completion/WeightedCompletionItem"

export class VariableSizeTypeCompletionProvider implements CompletionProvider {
    private readonly types: string[] = [
        "uint8",
        "uint16",
        "uint32",
        "uint64",
        "uint128",
        "uint256",
        "int8",
        "int16",
        "int32",
        "int64",
        "int128",
        "int256",
        "int257",
        "int{X}",
        "uint{X}",
        "bytes32",
        "bytes{X}",
        "bits256",
        "bits{X}",
    ]

    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.expression() || ctx.isType
    }

    public addCompletion(_ctx: CompletionContext, result: CompletionResult): void {
        for (const type of this.types) {
            result.add({
                label: type,
                kind: CompletionItemKind.TypeParameter,
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: type.includes("{X}") ? type.replace("{X}", "${1:32}") : type,
                weight: CompletionWeight.TYPE_ALIAS,
            })
        }
    }
}
