import type {Node as SyntaxNode} from "web-tree-sitter"
import * as lsp from "vscode-languageserver"

import {Reference} from "@server/languages/tlb/psi/Reference"
import {asLspRange} from "@server/utils/position"
import {TlbFile} from "@server/languages/tlb/psi/TlbFile"
import {NamedNode} from "@server/languages/tlb/psi/TlbNode"

export function provideTlbDefinition(
    node: SyntaxNode,
    file: TlbFile,
): lsp.Location[] | lsp.LocationLink[] {
    if (node.type !== "identifier" && node.type !== "type_identifier") return []

    const targets = Reference.multiResolve(new NamedNode(node, file))
    if (targets.length === 0) return []

    return targets.map(target => {
        const nameNode = target.nameNode()
        if (nameNode) {
            return {
                uri: file.uri,
                range: asLspRange(nameNode.node),
            }
        }

        return {
            uri: file.uri,
            range: asLspRange(target.node),
        }
    })
}
