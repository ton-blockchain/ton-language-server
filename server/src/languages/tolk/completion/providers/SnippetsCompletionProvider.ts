//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {CompletionProvider} from "@server/completion/CompletionProvider"
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"

export class SnippetsCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.isStatement && !ctx.topLevel && !ctx.afterDot
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        result.add({
            label: "val",
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "val ${1:name} = ${2:value};",
            weight: CompletionWeight.SNIPPET,
        })

        result.add({
            label: "var",
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "var ${1:name} = ${2:value};",
            weight: CompletionWeight.SNIPPET,
        })

        result.add({
            label: "valt",
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "val ${1:name}: ${2:int} = ${3:value};",
            weight: CompletionWeight.SNIPPET,
        })

        result.add({
            label: "vart",
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "var ${1:name}: ${2:int} = ${3:value};",
            weight: CompletionWeight.SNIPPET,
        })

        result.add({
            label: "if",
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "if (${1:condition}) {\n\t${0}\n}",
            weight: CompletionWeight.SNIPPET,
        })

        result.add({
            label: "ife",
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "if (${1:condition}) {\n\t${2}\n} else {\n\t${0}\n}",
            weight: CompletionWeight.SNIPPET,
        })

        result.add({
            label: "while",
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "while (${1:condition}) {\n\t${0}\n}",
            weight: CompletionWeight.SNIPPET,
        })

        result.add({
            label: "do-while",
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "do {\n\t${0}\n} while (${1:condition});",
            sortText: "1do",
            weight: CompletionWeight.SNIPPET,
        })

        result.add({
            label: "repeat",
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "repeat(${1:count}) {\n\t${0}\n}",
            weight: CompletionWeight.SNIPPET,
        })

        result.add({
            label: "try",
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "try {\n\t${0}\n}",
            weight: CompletionWeight.SNIPPET,
        })

        result.add({
            label: "tryc",
            kind: CompletionItemKind.Snippet,
            insertTextFormat: InsertTextFormat.Snippet,
            insertText: "try {\n\t${1}\n} catch (e) {\n\t${2}\n}",
            weight: CompletionWeight.SNIPPET,
        })

        // if:
        // try { ... } <caret>
        const prevSibling = ctx.element.node.parent?.previousSibling
        if (prevSibling?.firstChild?.type === "try") {
            result.add({
                label: "catch",
                kind: CompletionItemKind.Snippet,
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: "catch (${1:e}) {\n\t$0\n}",
                weight: CompletionWeight.CONTEXT_ELEMENT,
            })
        }
    }
}
