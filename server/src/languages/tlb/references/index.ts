import type {Node as SyntaxNode} from "web-tree-sitter"
import * as lsp from "vscode-languageserver"

import {asLspRange} from "@server/utils/position"
import {Referent} from "@server/languages/tlb/psi/Referent"
import {TlbFile} from "@server/languages/tlb/psi/TlbFile"

export function provideTlbReferences(
    referenceNode: SyntaxNode,
    file: TlbFile,
): lsp.Location[] | null {
    if (referenceNode.type !== "identifier" && referenceNode.type !== "type_identifier") {
        return []
    }

    const result = new Referent(referenceNode, file).findReferences({
        includeDefinition: false,
    })
    if (result.length === 0) return null

    return result.map(value => ({
        uri: value.file.uri,
        range: asLspRange(value.node),
    }))
}
