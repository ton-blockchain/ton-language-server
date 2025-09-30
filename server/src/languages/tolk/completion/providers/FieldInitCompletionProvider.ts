//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"

import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"
import {Reference} from "@server/languages/tolk/psi/Reference"
import {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import {typeOf} from "@server/languages/tolk/type-inference"
import {InstantiationTy, StructTy} from "@server/languages/tolk/types/ty"

export class FieldInitCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.fieldInit
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        const instanceArgument = ctx.element.parentOfType("instance_argument")
        if (!instanceArgument) return

        const fieldName = instanceArgument.childForFieldName("name")
        if (!fieldName) return

        const field = Reference.resolve(new NamedNode(fieldName, ctx.element.file))
        if (!field) return

        const fieldType = typeOf(field.node, field.file)
        if (!fieldType) return

        if (
            fieldType instanceof InstantiationTy &&
            fieldType.types.length > 0 &&
            fieldType.innerTy.name() === "Cell" &&
            fieldType.types[0] instanceof StructTy
        ) {
            // Cell<Foo> => Foo{}.toCell()
            const argTy = fieldType.types[0]

            result.add({
                label: argTy.name() + " {}.toCell()",
                kind: CompletionItemKind.Snippet,
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: argTy.name() + " {$0}.toCell()",
                weight: CompletionWeight.CONTEXT_ELEMENT,
            })
        }
    }
}
