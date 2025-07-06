import type {Node as SyntaxNode} from "web-tree-sitter"
import * as lsp from "vscode-languageserver"
import {generateFiftDocFor} from "@server/languages/fift/documentation/documentation"
import {asLspRange} from "@server/utils/position"
import {FiftFile} from "@server/languages/fift/psi/FiftFile"

export async function provideFiftDocumentation(
    hoverNode: SyntaxNode,
    file: FiftFile,
): Promise<lsp.Hover | null> {
    const doc = await generateFiftDocFor(hoverNode, file)
    if (doc === null) return null

    return {
        range: asLspRange(hoverNode),
        contents: {
            kind: "markdown",
            value: doc,
        },
    }
}
