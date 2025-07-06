import type {Node as SyntaxNode} from "web-tree-sitter"
import {FiftFile} from "@server/languages/fift/psi/FiftFile"
import * as lsp from "vscode-languageserver"
import {FiftReferent} from "@server/languages/fift/psi/FiftReferent"
import {asLspRange} from "@server/utils/position"

export function provideFiftReferences(node: SyntaxNode, file: FiftFile): lsp.Location[] | null {
    if (node.type !== "identifier") return []

    const result = new FiftReferent(node, file).findReferences(false)
    if (result.length === 0) return null

    return result.map(n => ({
        uri: n.file.uri,
        range: asLspRange(n.node),
    }))
}
