//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {ResolveState} from "@server/psi/ResolveState"
import {CompletionProvider} from "../CompletionProvider"
import {CompletionContext} from "@server/languages/tlb/completion/CompletionContext"
import {CompletionResult} from "@server/languages/tlb/completion/WeightedCompletionItem"
import {ReferenceCompletionProcessor} from "@server/languages/tlb/completion/ReferenceCompletionProcessor"
import {TlbReference} from "@server/languages/tlb/psi/TlbReference"

export class ReferenceCompletionProvider implements CompletionProvider {
    public constructor(private readonly ref: TlbReference) {}

    public isAvailable(_ctx: CompletionContext): boolean {
        return true
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        const state = new ResolveState()
        const processor = new ReferenceCompletionProcessor(ctx)

        this.ref.processResolveVariants(processor, state.withValue("completion", "true"))

        result.add(...processor.result.values())
    }
}
