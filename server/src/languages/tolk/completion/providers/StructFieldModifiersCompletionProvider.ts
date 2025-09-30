//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {CompletionItemKind} from "vscode-languageserver-types"

import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"
import {Field} from "@server/languages/tolk/psi/Decls"

export class StructFieldModifiersCompletionProvider
    implements CompletionProvider<CompletionContext>
{
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.expectFieldModifier
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        const fieldDeclaration = ctx.element.node.parent

        const modifiers = fieldDeclaration
            ? new Field(fieldDeclaration, ctx.element.file).modifiers()
            : []

        if (!modifiers.includes("readonly")) {
            result.add({
                label: "readonly ",
                kind: CompletionItemKind.Keyword,
                weight: CompletionWeight.KEYWORD,
            })
        }

        if (!modifiers.includes("private")) {
            result.add({
                label: "private ",
                kind: CompletionItemKind.Keyword,
                weight: CompletionWeight.KEYWORD,
            })
        }
    }
}
