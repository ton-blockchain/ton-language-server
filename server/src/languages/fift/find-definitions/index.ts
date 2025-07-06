import type {Node as SyntaxNode} from "web-tree-sitter"
import * as lsp from "vscode-languageserver"
import {FiftReference} from "@server/languages/fift/psi/FiftReference"
import {asLspRange} from "@server/utils/position"
import {FiftFile} from "@server/languages/fift/psi/FiftFile"

export function provideFiftDefinition(
    node: SyntaxNode,
    file: FiftFile,
): lsp.Location[] | lsp.LocationLink[] {
    const definition = FiftReference.resolve(node, file)
    if (!definition) return []

    return [
        {
            uri: file.uri,
            range: asLspRange(definition),
        },
    ]
}
