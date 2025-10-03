import type {Node as SyntaxNode} from "web-tree-sitter"

import * as lsp from "vscode-languageserver"

import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {Referent} from "@server/languages/tolk/psi/Referent"
import {CallLike, NamedNode, TolkNode} from "@server/languages/tolk/psi/TolkNode"
import {asLspRange} from "@server/utils/position"
import {Reference} from "@server/languages/tolk/psi/Reference"
import {InstanceMethod} from "@server/languages/tolk/psi/Decls"

export function provideTolkDocumentHighlight(
    highlightNode: SyntaxNode,
    file: TolkFile,
): lsp.DocumentHighlight[] | null {
    if (highlightNode.type !== "identifier" && highlightNode.type !== "type_identifier") {
        return []
    }

    const result = new Referent(highlightNode, file).findReferences({
        includeDefinition: true,
        sameFileOnly: true,
    })
    if (result.length === 0) return null

    const usageKind = (value: TolkNode): lsp.DocumentHighlightKind => {
        const parent = value.node.parent
        if (parent?.type === "assignment" || parent?.type === "set_assignment") {
            if (parent.childForFieldName("left")?.equals(value.node)) {
                // left = 10
                // ^^^^
                return lsp.DocumentHighlightKind.Write
            }
        }

        if (parent?.type === "dot_access" && parent.parent?.type === "function_call") {
            const call = new CallLike(parent.parent, file)
            const calleeName = call.calleeName()
            if (!calleeName) return lsp.DocumentHighlightKind.Read

            const called = Reference.resolve(new NamedNode(calleeName, file))
            if (!called) return lsp.DocumentHighlightKind.Read

            if (called instanceof InstanceMethod && called.isMutating()) {
                return lsp.DocumentHighlightKind.Write
            }
        }

        return lsp.DocumentHighlightKind.Read
    }

    return result.map(value => ({
        range: asLspRange(value.node),
        kind: usageKind(value),
    }))
}
