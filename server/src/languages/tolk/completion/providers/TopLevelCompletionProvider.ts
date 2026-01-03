//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"

import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"

export class TopLevelCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.topLevel
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        result.add({
            label: `import`,
            labelDetails: {
                detail: ` ""`,
            },
            kind: CompletionItemKind.Keyword,
            insertText: `import "$1"$0`,
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: `struct`,
            labelDetails: {
                detail: " Name {}",
            },
            kind: CompletionItemKind.Keyword,
            insertText: "struct ${1:Name} {$0}",
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: `enum`,
            labelDetails: {
                detail: " Name {}",
            },
            kind: CompletionItemKind.Keyword,
            insertText: "enum ${1:Name} {$0}",
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: `type`,
            labelDetails: {
                detail: " Int = int",
            },
            kind: CompletionItemKind.Keyword,
            insertText: "type ${1:Int} = ${2:int}$0",
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: `const`,
            labelDetails: {
                detail: " FOO: <type> = <value>",
            },
            kind: CompletionItemKind.Keyword,
            insertText: "const ${1:FOO}: ${2:int} = ${3:0}$0",
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: `global`,
            labelDetails: {
                detail: " foo: <type> = <value>",
            },
            kind: CompletionItemKind.Keyword,
            insertText: "global ${1:foo}: ${2:int}$0",
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        // functions

        const funLabel = " name() {}"
        const funTemplate = "${1:name}($2)$3 {$0}"

        result.add({
            label: `fun`,
            labelDetails: {
                detail: funLabel,
            },
            kind: CompletionItemKind.Keyword,
            insertText: `fun ${funTemplate}`,
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: `inline fun`,
            labelDetails: {
                detail: funLabel,
            },
            kind: CompletionItemKind.Keyword,
            insertText: `@inline\nfun ${funTemplate}`,
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: `inline_ref fun`,
            labelDetails: {
                detail: funLabel,
            },
            kind: CompletionItemKind.Keyword,
            insertText: `@inline_ref\nfun ${funTemplate}`,
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: `asm fun`,
            labelDetails: {
                detail: ' name() asm "..."',
            },
            kind: CompletionItemKind.Keyword,
            insertText: 'fun ${1:name}($2)$3 asm "$0"',
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD + 10,
        })

        result.add({
            label: `method fun`,
            labelDetails: {
                detail: " Foo.name(self) {}",
            },
            kind: CompletionItemKind.Keyword,
            insertText: "fun ${1:Foo}.${2:name}(${3:self}$4)$5 {$0}",
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: `static method fun`,
            labelDetails: {
                detail: " Foo.name() {}",
            },
            kind: CompletionItemKind.Keyword,
            insertText: "fun ${1:Foo}.${2:name}($3)$4 {$0}",
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        result.add({
            label: `get fun`,
            labelDetails: {
                detail: " name() {}",
            },
            kind: CompletionItemKind.Keyword,
            insertText: `get fun ${funTemplate}`,
            insertTextFormat: InsertTextFormat.Snippet,
            weight: CompletionWeight.KEYWORD,
        })

        if (ctx.element.file.isTestFile) {
            result.add({
                label: `get fun test`,
                labelDetails: {
                    detail: "() {}",
                },
                kind: CompletionItemKind.Keyword,
                insertText: "get fun `test $1`() {$0}",
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.KEYWORD,
            })
        }
    }
}
