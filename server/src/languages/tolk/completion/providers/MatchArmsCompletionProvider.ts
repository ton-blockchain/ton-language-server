//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {CompletionProvider} from "@server/completion/CompletionProvider"
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"
import {parentOfType} from "@server/psi/utils"
import {inferenceOf} from "@server/languages/tolk/type-inference"
import {UnionTy} from "@server/languages/tolk/types/ty"
import {ResolveState} from "@server/psi/ResolveState"
import {ReferenceCompletionProcessor} from "@server/languages/tolk/completion/ReferenceCompletionProcessor"
import {Reference} from "@server/languages/tolk/psi/Reference"

export class MatchArmsCompletionProvider implements CompletionProvider<CompletionContext> {
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

            let seenElse = false

            const arms = body.namedChildren.filter(it => it?.type === "match_arm")
            for (const arm of arms) {
                if (arm?.childForFieldName("pattern_else")) {
                    seenElse = true
                }
            }

            if (!seenElse) {
                result.add({
                    label: "else",
                    labelDetails: {
                        detail: " => {}",
                    },
                    kind: CompletionItemKind.Event,
                    insertTextFormat: InsertTextFormat.Snippet,
                    insertText: "else => {$0},",
                    weight: CompletionWeight.SNIPPET + 10,
                })
            }
            return
        }

        const arms = body.namedChildren.filter(it => it?.type === "match_arm")

        let seenElse = false
        const handledTypes: Set<string> = new Set()

        for (const arm of arms) {
            if (!arm) continue

            if (arm.childForFieldName("pattern_else")) {
                seenElse = true
                continue
            }

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

        if (!seenElse) {
            result.add({
                label: "else",
                labelDetails: {
                    detail: " => {}",
                },
                kind: CompletionItemKind.Event,
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: "else => {$0},",
                weight: CompletionWeight.SNIPPET + 10,
            })
        }
    }
}
