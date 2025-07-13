//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {CompletionResult} from "@server/completion/WeightedCompletionItem"

export interface CompletionProvider<Ctx> {
    isAvailable(ctx: Ctx): boolean

    addCompletion(ctx: Ctx, result: CompletionResult): void
}

export interface AsyncCompletionProvider<Ctx> {
    isAvailable(ctx: Ctx): boolean

    addCompletion(ctx: Ctx, result: CompletionResult): Promise<void>
}
