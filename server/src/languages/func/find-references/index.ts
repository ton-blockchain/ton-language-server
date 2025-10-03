import * as lsp from "vscode-languageserver"
import type {Node as SyntaxNode} from "web-tree-sitter"

import {asLspRange} from "@server/utils/position"
import {FuncFile} from "@server/languages/func/psi/FuncFile"
import {Referent} from "@server/languages/func/psi/Referent"
import {getDocumentSettings} from "@server/settings/settings"

export async function provideFuncReferences(
    referenceNode: SyntaxNode,
    file: FuncFile,
): Promise<lsp.Location[] | null> {
    if (referenceNode.type !== "identifier" && referenceNode.type !== "type_identifier") {
        return []
    }

    const result = new Referent(referenceNode, file).findReferences({
        includeDefinition: false,
    })
    if (result.length === 0) return null

    const settings = await getDocumentSettings(file.uri)
    if (settings.tolk.findUsages.scope === "workspace") {
        // filter out references from stdlib
        return result
            .filter(value => !value.file.fromStdlib && !value.file.fromStubs)
            .map(value => ({
                uri: value.file.uri,
                range: asLspRange(value.node),
            }))
    }

    return result.map(value => ({
        uri: value.file.uri,
        range: asLspRange(value.node),
    }))
}
