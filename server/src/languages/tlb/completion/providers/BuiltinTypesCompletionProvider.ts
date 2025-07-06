//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio

import {CompletionProvider} from "@server/languages/tlb/completion/CompletionProvider"
import {CompletionContext} from "@server/languages/tlb/completion/CompletionContext"
import {
    CompletionResult,
    CompletionWeight,
} from "@server/languages/tlb/completion/WeightedCompletionItem"
import {CompletionItemKind} from "vscode-languageserver-types"

export const BUILTIN_TYPES: Map<string, string> = new Map([
    ["#", "Nat, 32-bit unsigned integer"],
    ["##", "Nat: unsigned integer with `x` bits"],
    [
        "#<",
        "Nat: unsigned integer less than `x` stored with the minimum number `⌈log2 x⌉` of bits (up to 31) to represent the number `x`",
    ],
    [
        "#<=",
        "Nat: unsigned integer less than or equal `x` stored with the minimum number `⌈log2(x+1)⌉` of bits (up to 32) to represent the number `x`",
    ],
    ["Any", "Remaining bits and references"],
    ["Cell", "Remaining bits and references"],
    ["Int", "257 bits"],
    ["UInt", "256 bits"],
    ["Bits", "1023 bits"],
    ["bits", "X bits"],
    ["uint", ""],
    ["uint8", ""],
    ["uint16", ""],
    ["uint32", ""],
    ["uint64", ""],
    ["uint128", ""],
    ["uint256", ""],
    ["int", ""],
    ["int8", ""],
    ["int16", ""],
    ["int32", ""],
    ["int64", ""],
    ["int128", ""],
    ["int256", ""],
    ["int257", ""],
    ["Type", "Built-in TL-B type representing the type of types"],
])

export class BuiltinTypesCompletionProvider implements CompletionProvider {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.isType
    }

    public addCompletion(_ctx: CompletionContext, result: CompletionResult): void {
        for (const [type, description] of BUILTIN_TYPES) {
            result.add({
                label: type,
                labelDetails: {
                    detail: ` ${description}`,
                },
                kind: CompletionItemKind.Struct,
                weight: CompletionWeight.CONTEXT_ELEMENT,
            })
        }
    }
}
