//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {CompletionContext} from "./CompletionContext"
import {CompletionResult} from "@server/languages/func/completion/WeightedCompletionItem"

export interface CompletionProvider {
    isAvailable(ctx: CompletionContext): boolean
    addCompletion(ctx: CompletionContext, result: CompletionResult): void
}

export interface AsyncCompletionProvider {
    isAvailable(ctx: CompletionContext): boolean
    addCompletion(ctx: CompletionContext, result: CompletionResult): Promise<void>
}
