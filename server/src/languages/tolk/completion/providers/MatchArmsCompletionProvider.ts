//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {CompletionProvider} from "@server/languages/tolk/completion/CompletionProvider"
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {
    CompletionResult,
    CompletionWeight,
} from "@server/languages/tolk/completion/WeightedCompletionItem"
import {parentOfType} from "@server/psi/utils"
import {inferenceOf} from "@server/languages/tolk/type-inference"
import {UnionTy} from "@server/languages/tolk/types/ty"
import {ResolveState} from "@server/psi/ResolveState"
import {ReferenceCompletionProcessor} from "@server/languages/tolk/completion/ReferenceCompletionProcessor"
import {Reference} from "@server/languages/tolk/psi/Reference"

export class MatchArmsCompletionProvider implements CompletionProvider {
    public constructor(private readonly ref: Reference) {}

    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.expectMatchArm
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        const parentMatch = parentOfType(ctx.element.node, "match_expression")
        if (!parentMatch) return

        const expr = parentMatch.childForFieldName("expr")
        const body = parentMatch.childForFieldName("body")
        if (!expr || !body) return

        const inference = inferenceOf(expr, ctx.element.file)
        if (!inference) return

        const exprTy = inference.typeOf(expr)?.baseType()
        if (!exprTy) return

        if (!(exprTy instanceof UnionTy)) {
            // non type-match

            const state = new ResolveState()
            const processor = new ReferenceCompletionProcessor(ctx)

            this.ref.processResolveVariants(processor, state.withValue("completion", "true"))

            for (const value of processor.result.values()) {
                result.add({
                    ...value,
                    insertText: value.insertText + "$1 => {$0}",
                })
            }
            return
        }

        const arms = body.namedChildren.filter(it => it?.type === "match_arm")

        const handledTypes: Set<string> = new Set()

        for (const arm of arms) {
            if (!arm) continue

            const patternType = arm.childForFieldName("pattern_type")
            if (!patternType) continue

            const type = inference.typeOf(patternType)
            if (!type) continue

            handledTypes.add(type.name())
        }

        for (const variant of exprTy.elements) {
            const variantName = variant.name()
            if (handledTypes.has(variantName)) continue

            result.add({
                label: variantName,
                labelDetails: {
                    detail: " => {}",
                },
                kind: CompletionItemKind.Event,
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: variantName + " => {$0},",
                weight: CompletionWeight.SNIPPET,
            })
        }
    }
}
