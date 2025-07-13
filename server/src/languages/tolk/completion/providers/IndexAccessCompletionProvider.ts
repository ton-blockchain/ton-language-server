//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"
import {typeOf} from "@server/languages/tolk/type-inference"
import {TensorTy, TupleTy} from "@server/languages/tolk/types/ty"
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"

export class IndexAccessCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.afterDot
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        const element = ctx.element
        const parent = element.node.parent

        if (parent?.type === "dot_access") {
            const qualifier = parent.childForFieldName("obj")
            if (!qualifier) return

            const qualifierType = typeOf(qualifier, element.file)
            if (!qualifierType) return

            if (qualifierType instanceof TupleTy || qualifierType instanceof TensorTy) {
                const length = qualifierType.elements.length

                for (let i = 0; i < length; i++) {
                    result.add({
                        label: i.toString(),
                        kind: CompletionItemKind.Field,
                        insertTextFormat: InsertTextFormat.Snippet,
                        weight: CompletionWeight.FIELD,
                    })
                }
            }
        }
    }
}
