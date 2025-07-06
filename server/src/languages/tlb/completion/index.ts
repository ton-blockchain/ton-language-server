import * as lsp from "vscode-languageserver"
import {getOffsetFromPosition} from "@server/document-store"
import {asParserPoint} from "@server/utils/position"
import {getDocumentSettings} from "@server/settings/settings"
import {CompletionResult} from "@server/languages/tolk/completion/WeightedCompletionItem"
import {TlbFile} from "@server/languages/tlb/psi/TlbFile"
import {createTlbParser} from "@server/parser"
import {NamedNode} from "@server/languages/tlb/psi/TlbNode"
import {TlbReference} from "@server/languages/tlb/psi/TlbReference"
import {CompletionContext} from "@server/languages/tlb/completion/CompletionContext"
import {CompletionProvider} from "@server/languages/tlb/completion/CompletionProvider"
import {ReferenceCompletionProvider} from "@server/languages/tlb/completion/providers/ReferenceCompletionProvider"
import {BuiltinTypesCompletionProvider} from "@server/languages/tlb/completion/providers/BuiltinTypesCompletionProvider"

export async function provideTlbCompletion(
    file: TlbFile,
    params: lsp.CompletionParams,
    uri: string,
): Promise<lsp.CompletionItem[]> {
    const content = file.content
    const parser = createTlbParser()

    const offset = getOffsetFromPosition(
        content,
        params.position.line,
        params.position.character + 1,
    )
    const start = content.slice(0, offset)
    const end = content.slice(offset)

    const newContent = `${start}DummyIdentifier${end}`
    const tree = parser.parse(newContent)
    if (!tree) return []

    const cursorPosition = asParserPoint(params.position)
    const cursorNode = tree.rootNode.descendantForPosition(cursorPosition)
    if (
        cursorNode === null ||
        (cursorNode.type !== "identifier" && cursorNode.type !== "type_identifier")
    ) {
        return []
    }

    const newFile = new TlbFile(uri, tree, newContent)
    const element = new NamedNode(cursorNode, newFile)
    const ref = new TlbReference(element, newFile)

    const ctx = new CompletionContext(
        element,
        params.position,
        params.context?.triggerKind ?? lsp.CompletionTriggerKind.Invoked,
        await getDocumentSettings(uri),
    )

    const result = new CompletionResult()
    const providers: CompletionProvider[] = [
        new ReferenceCompletionProvider(ref),
        new BuiltinTypesCompletionProvider(),
    ]

    for (const provider of providers) {
        if (!provider.isAvailable(ctx)) continue
        provider.addCompletion(ctx, result)
    }

    return result.sorted()
}
