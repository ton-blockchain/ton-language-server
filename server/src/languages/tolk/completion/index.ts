//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core

import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import * as lsp from "vscode-languageserver"
import {createTolkParser} from "@server/parser"
import {getOffsetFromPosition} from "@server/document-store"
import {asParserPoint} from "@server/utils/position"
import {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import {Reference} from "@server/languages/tolk/psi/Reference"
import {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult} from "@server/completion/WeightedCompletionItem"
import type {
    AsyncCompletionProvider,
    CompletionProvider,
} from "@server/completion/CompletionProvider"
import {TopLevelCompletionProvider} from "@server/languages/tolk/completion/providers/TopLevelCompletionProvider"
import {SnippetsCompletionProvider} from "@server/languages/tolk/completion/providers/SnippetsCompletionProvider"
import {KeywordsCompletionProvider} from "@server/languages/tolk/completion/providers/KeywordsCompletionProvider"
import {ReferenceCompletionProvider} from "@server/languages/tolk/completion/providers/ReferenceCompletionProvider"
import {findTolkFile} from "@server/files"
import {index} from "@server/languages/tolk/indexes"
import {FileDiff} from "@server/utils/FileDiff"
import {ThrowAssertCompletionProvider} from "@server/languages/tolk/completion/providers/ThrowAssertCompletionProvider"
import {ReturnCompletionProvider} from "@server/languages/tolk/completion/providers/ReturnCompletionProvider"
import {EntryPointsCompletionProvider} from "@server/languages/tolk/completion/providers/EntryPointsCompletionProvider"
import {AnnotationsCompletionProvider} from "@server/languages/tolk/completion/providers/AnnotationsCompletionProvider"
import {ImportPathCompletionProvider} from "@server/languages/tolk/completion/providers/ImportPathCompletionProvider"
import {IndexAccessCompletionProvider} from "@server/languages/tolk/completion/providers/IndexAccessCompletionProvider"
import {VariableSizeTypeCompletionProvider} from "@server/languages/tolk/completion/providers/VariableSizeTypeCompletionProvider"
import {ExpressionSnippetsCompletionProvider} from "@server/languages/tolk/completion/providers/ExpressionSnippetsCompletionProvider"
import {MatchArmsCompletionProvider} from "@server/languages/tolk/completion/providers/MatchArmsCompletionProvider"
import {CompletionItemAdditionalInformation} from "@server/completion/CompletionItemAdditionalInformation"

export async function provideTolkCompletion(
    file: TolkFile,
    params: lsp.CompletionParams,
    uri: string,
): Promise<lsp.CompletionItem[]> {
    const content = file.content
    const parser = createTolkParser()

    const offset = getOffsetFromPosition(
        content,
        params.position.line,
        params.position.character + 1,
    )
    const start = content.slice(0, offset)
    const end = content.slice(offset)

    // Let's say we want to get autocompletion in the following code:
    //
    //   fun foo(p: builder) {
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
    //    fun foo(p: builder) {
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

    const element = new NamedNode(cursorNode, new TolkFile(uri, tree, newContent))
    const ref = new Reference(element, false, false)

    const ctx = new CompletionContext(
        newContent,
        element,
        params.position,
        params.context?.triggerKind ?? lsp.CompletionTriggerKind.Invoked,
    )

    const result = new CompletionResult()
    const providers: CompletionProvider<CompletionContext>[] = [
        new TopLevelCompletionProvider(),
        new SnippetsCompletionProvider(),
        new ExpressionSnippetsCompletionProvider(),
        new KeywordsCompletionProvider(),
        new ReferenceCompletionProvider(ref),
        new ThrowAssertCompletionProvider(),
        new ReturnCompletionProvider(),
        new EntryPointsCompletionProvider(),
        new AnnotationsCompletionProvider(),
        new IndexAccessCompletionProvider(),
        new VariableSizeTypeCompletionProvider(),
        new MatchArmsCompletionProvider(ref),
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

export async function provideTolkCompletionResolve(
    item: lsp.CompletionItem,
): Promise<lsp.CompletionItem> {
    if (!item.data) return item
    const data = item.data as CompletionItemAdditionalInformation
    if (data.file === undefined || data.elementFile === undefined || data.name === undefined) {
        return item
    }
    if (data.language !== "tolk") return item

    // const settings = await getDocumentSettings(data.file.uri)
    // if (!settings.completion.addImports) return item

    const file = await findTolkFile(data.file.uri)
    const elementFile = await findTolkFile(data.elementFile.uri)

    // skip the same file element
    if (file.uri === elementFile.uri) return item
    const importPath = elementFile.importPath(file)
    // already imported
    if (file.alreadyImport(importPath)) return item
    // some files like stubs or stdlib imported implicitly
    if (elementFile.isImportedImplicitly()) return item
    // guard for multi projects
    if (index.hasSeveralDeclarations(data.name)) return item

    const positionToInsert = file.positionForNextImport()

    const extraLine = positionToInsert.line === 0 && file.imports().length === 0 ? "\n" : ""

    const diff = FileDiff.forFile(elementFile.uri)
    diff.appendAsPrevLine(positionToInsert.line, `import "${importPath}";${extraLine}`)

    return {
        ...item,
        additionalTextEdits: diff.toTextEdits(),
    }
}
