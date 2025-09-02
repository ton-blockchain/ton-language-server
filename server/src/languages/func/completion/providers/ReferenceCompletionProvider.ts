//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/func/completion/CompletionContext"
import {Reference} from "@server/languages/func/psi/Reference"
import {ReferenceCompletionProcessor} from "@server/languages/func/completion/ReferenceCompletionProcessor"
import type {CompletionResult} from "@server/completion/WeightedCompletionItem"
import {ResolveState} from "@server/psi/ResolveState"

export class ReferenceCompletionProvider implements CompletionProvider<CompletionContext> {
    public constructor(private readonly ref: Reference) {}

    public isAvailable(ctx: CompletionContext): boolean {
        return !ctx.topLevel && !ctx.insideImport
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        const state = new ResolveState()
        const processor = new ReferenceCompletionProcessor(ctx)

        this.ref.processResolveVariants(processor, state.withValue("completion", "true"))
        result.add(...processor.result.values())
    }
}
