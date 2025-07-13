//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core

import {FuncFile} from "@server/languages/func/psi/FuncFile"
import * as lsp from "vscode-languageserver"
import {createFuncParser} from "@server/parser"
import {getOffsetFromPosition} from "@server/document-store"
import {asParserPoint} from "@server/utils/position"
import {NamedNode} from "@server/languages/func/psi/FuncNode"
import {Reference} from "@server/languages/func/psi/Reference"
import {CompletionContext} from "@server/languages/func/completion/CompletionContext"
import {CompletionResult} from "@server/completion/WeightedCompletionItem"
import type {
    AsyncCompletionProvider,
    CompletionProvider,
} from "@server/completion/CompletionProvider"
import {ReferenceCompletionProvider} from "@server/languages/func/completion/providers/ReferenceCompletionProvider"
import {ImportPathCompletionProvider} from "@server/languages/func/completion/providers/ImportPathCompletionProvider"
import {TopLevelCompletionProvider} from "@server/languages/func/completion/providers/TopLevelCompletionProvider"

export async function provideFuncCompletion(
    file: FuncFile,
    params: lsp.CompletionParams,
    uri: string,
): Promise<lsp.CompletionItem[]> {
    const content = file.content
    const parser = createFuncParser()

    const offset = getOffsetFromPosition(
        content,
        params.position.line,
        params.position.character + 1,
    )
    const start = content.slice(0, offset)
    const end = content.slice(offset)

    // Let's say we want to get autocompletion in the following code:
    //
    //   () foo(p builder) {
    //      p.
    //   } // ^ caret here
    //
    // Regular parsers, including those that can recover from errors, will not
    // be able to parse this code well enough for us to recognize this situation.
    // Some Language Servers try to do this, but they end up with a lot of
    // incomprehensible and complex code that doesn't work well.
    //
    // The approach we use is very simple; instead of parsing the code above,
    // we transform it into:
    //
    //    () foo(p builder) {
    //       p.dummyIdentifier
    //    } // ^ caret here
    //
    // Which will be parsed without any problems now.
    //
    // Now that we have valid code, we can use `Reference.processResolveVariants`
    // to resolve `DummyIdentifier` into a list of possible variants, which will
    // become the autocompletion list. See `Reference` class documentation.
    const newContent = `${start}DummyIdentifier${end}`
    const tree = parser.parse(newContent)
    if (!tree) return []

    const cursorPosition = asParserPoint(params.position)
    const cursorNode = tree.rootNode.descendantForPosition(cursorPosition)
    if (
        cursorNode === null ||
        (cursorNode.type !== "identifier" &&
            cursorNode.type !== "type_identifier" &&
            cursorNode.type !== "string_literal")
    ) {
        return []
    }

    const element = new NamedNode(cursorNode, new FuncFile(uri, tree, newContent))
    const ref = new Reference(element, false, false)

    const ctx = new CompletionContext(
        newContent,
        element,
        params.position,
        params.context?.triggerKind ?? lsp.CompletionTriggerKind.Invoked,
    )

    const result = new CompletionResult()
    const providers: CompletionProvider<CompletionContext>[] = [
        new ReferenceCompletionProvider(ref),
        new TopLevelCompletionProvider(),
    ]

    for (const provider of providers) {
        if (!provider.isAvailable(ctx)) continue
        provider.addCompletion(ctx, result)
    }

    const asyncProviders: AsyncCompletionProvider<CompletionContext>[] = [
        new ImportPathCompletionProvider(),
    ]

    for (const provider of asyncProviders) {
        if (!provider.isAvailable(ctx)) continue
        await provider.addCompletion(ctx, result)
    }
    return result.sorted()
}
