//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {CompletionProvider} from "@server/completion/CompletionProvider"
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"

export class FunctionNameCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.isFunctionName || ctx.isMethodName
    }

    public readonly functions: [string, string][] = [
        ["onInternalMessage", "in: InMessage"],
        ["onExternalMessage", "inMsg: slice"],
        ["onBouncedMessage", "in: InMessageBounced"],
        ["onRunTickTock", "isTock: bool"],
        ["onSplitPrepare", ""],
        ["onSplitInstall", ""],
        ["main", ""],
    ]

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        const definedFunctions = new Set(ctx.element.file.getFunctions().map(it => it.name()))

        const fun = ctx.element.node.parent
        if (!fun) return

        const parameters = fun.childForFieldName("parameters")
        const hasBodyAndParams = parameters != null && fun.childForFieldName("body") != null

        if (ctx.isFunctionName) {
            for (const [fun, signature] of this.functions) {
                if (definedFunctions.has(fun)) continue

                if (hasBodyAndParams) {
                    result.add({
                        label: fun,
                        labelDetails: {
                            detail: `(${signature})`,
                        },
                        kind: CompletionItemKind.Function,
                        insertTextFormat: InsertTextFormat.Snippet,
                        insertText: fun,
                        weight: CompletionWeight.FUNCTION,
                    })
                } else {
                    result.add({
                        label: fun,
                        labelDetails: {
                            detail: `(${signature}) {}`,
                        },
                        kind: CompletionItemKind.Function,
                        insertTextFormat: InsertTextFormat.Snippet,
                        insertText: `${fun}(${signature}) {$0}`,
                        weight: CompletionWeight.FUNCTION,
                    })
                }
            }
        }

        if (ctx.isMethodName) {
            if (hasBodyAndParams) {
                result.add({
                    label: "unpackFromSlice",
                    labelDetails: {
                        detail: "(mutate s: slice)",
                    },
                    kind: CompletionItemKind.Function,
                    insertTextFormat: InsertTextFormat.Snippet,
                    insertText: "unpackFromSlice",
                    weight: CompletionWeight.FUNCTION,
                })
            } else {
                result.add({
                    label: "unpackFromSlice",
                    labelDetails: {
                        detail: "(mutate s: slice) {}",
                    },
                    kind: CompletionItemKind.Function,
                    insertTextFormat: InsertTextFormat.Snippet,
                    insertText: "unpackFromSlice(mutate s: slice) {$0}",
                    weight: CompletionWeight.FUNCTION,
                })
            }

            if (hasBodyAndParams) {
                result.add({
                    label: "packToBuilder",
                    labelDetails: {
                        detail: "(self, mutate b: builder)",
                    },
                    kind: CompletionItemKind.Function,
                    insertTextFormat: InsertTextFormat.Snippet,
                    insertText: "packToBuilder",
                    weight: CompletionWeight.FUNCTION,
                })
            } else {
                result.add({
                    label: "packToBuilder",
                    labelDetails: {
                        detail: "(self, mutate b: builder)",
                    },
                    kind: CompletionItemKind.Function,
                    insertTextFormat: InsertTextFormat.Snippet,
                    insertText: "packToBuilder(self, mutate b: builder) {$0}",
                    weight: CompletionWeight.FUNCTION,
                })
            }
        }
    }
}
