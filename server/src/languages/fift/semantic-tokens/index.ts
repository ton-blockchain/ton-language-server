//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type {SemanticTokens} from "vscode-languageserver"
import {RecursiveVisitor} from "@server/visitor/visitor"
import {SemanticTokenTypes} from "vscode-languageserver-protocol"
import {FiftReference} from "@server/languages/fift/psi/FiftReference"
import {FiftFile} from "@server/languages/fift/psi/FiftFile"
import {Tokens} from "@server/semantic/tokens"

export function provideFiftSemanticTokens(
    file: FiftFile,
    settings: {
        enabled: boolean
    },
): SemanticTokens | null {
    if (!settings.enabled) return null

    const tokens = new Tokens()

    RecursiveVisitor.visit(file.rootNode, (node): boolean => {
        if (
            node.type === "proc_definition" ||
            node.type === "proc_inline_definition" ||
            node.type === "proc_ref_definition" ||
            node.type === "method_definition" ||
            node.type === "declaration"
        ) {
            const nameNode = node.childForFieldName("name")
            if (nameNode) {
                tokens.node(nameNode, SemanticTokenTypes.function)
            }
        }

        if (
            node.type === "identifier" &&
            node.parent?.type === "proc_call" &&
            node.parent.firstChild?.equals(node)
        ) {
            const def = FiftReference.resolve(node, file)
            if (def) {
                tokens.node(node, SemanticTokenTypes.function)
            }
        }

        return true
    })

    return {
        resultId: Date.now().toString(),
        data: tokens.result(),
    }
}
