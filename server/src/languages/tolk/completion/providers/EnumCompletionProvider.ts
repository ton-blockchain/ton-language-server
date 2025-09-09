//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult} from "@server/completion/WeightedCompletionItem"
import {index, IndexKey} from "@server/languages/tolk/indexes"
import {ScopeProcessor} from "@server/languages/tolk/psi/Reference"
import {Enum} from "@server/languages/tolk/psi/Decls"
import {ResolveState} from "@server/psi/ResolveState"
import {ReferenceCompletionProcessor} from "@server/languages/tolk/completion/ReferenceCompletionProcessor"

export class EnumCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.expression()
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        const state = new ResolveState()
        const processor = new ReferenceCompletionProcessor(ctx)

        EnumCompletionProvider.process(processor, state)

        result.add(...processor.result.values())
    }

    public static process(processor: ReferenceCompletionProcessor, state: ResolveState): void {
        index.processElementsByKey(
            IndexKey.Enums,
            new (class implements ScopeProcessor {
                public execute(node: Enum, state: ResolveState): boolean {
                    for (const member of node.members()) {
                        if (!processor.execute(member, state.withValue("need-prefix", "true"))) {
                            return false
                        }
                    }
                    return true
                }
            })(),
            state,
        )
    }
}
