//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"

import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {Func} from "@server/languages/tolk/psi/Decls"
import {UnionTy, NullTy, BoolTy, IntTy, VoidTy} from "@server/languages/tolk/types/ty"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"
import {functionTypeOf} from "@server/languages/tolk/type-inference"

export class ReturnCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.isStatement
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        const outerFunctionNode = ctx.element.parentOfType(
            "function_declaration",
            "method_declaration",
            "get_method_declaration",
        )
        if (!outerFunctionNode) return
        const outerFunction = new Func(outerFunctionNode, ctx.element.file)
        const funcTy = functionTypeOf(outerFunction)
        const returnType = funcTy?.returnTy ?? VoidTy.VOID

        if (returnType instanceof VoidTy) {
            result.add({
                label: "return;",
                kind: CompletionItemKind.Keyword,
                insertText: "return;",
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.KEYWORD,
            })
            return
        }

        result.add({
            label: "return <expr>;",
            kind: CompletionItemKind.Keyword,
            insertText: "return $0;",
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        if (returnType instanceof BoolTy) {
            result.add({
                label: "return true;",
                kind: CompletionItemKind.Snippet,
                weight: CompletionWeight.KEYWORD,
            })

            result.add({
                label: "return false;",
                kind: CompletionItemKind.Snippet,
                weight: CompletionWeight.KEYWORD,
            })
        }

        if (returnType instanceof IntTy) {
            result.add({
                label: "return 0;",
                kind: CompletionItemKind.Snippet,
                weight: CompletionWeight.KEYWORD,
            })
        }

        if (returnType instanceof UnionTy && returnType.elements.some(it => it instanceof NullTy)) {
            result.add({
                label: "return null;",
                kind: CompletionItemKind.Snippet,
                weight: CompletionWeight.KEYWORD,
            })
        }
    }
}
