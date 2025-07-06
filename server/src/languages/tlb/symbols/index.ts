import * as lsp from "vscode-languageserver"
import {SymbolKind} from "vscode-languageserver"
import {asLspRange, asNullableLspRange} from "@server/utils/position"
import {TlbFile} from "@server/languages/tlb/psi/TlbFile"
import {DeclarationNode} from "@server/languages/tlb/psi/TlbNode"

export function provideTlbDocumentSymbols(file: TlbFile): lsp.DocumentSymbol[] {
    const result: lsp.DocumentSymbol[] = []

    const decls = file.getDeclarations()
    decls.forEach(decl => result.push(createSymbol(decl)))

    return result.sort((a, b) => a.range.start.line - b.range.start.line)
}

function createSymbol(element: DeclarationNode): lsp.DocumentSymbol {
    return {
        name: element.name(),
        kind: SymbolKind.Class,
        detail: element.node.text,
        range: asLspRange(element.node),
        selectionRange: asNullableLspRange(element.nameIdentifier()),
        children: [],
    }
}
