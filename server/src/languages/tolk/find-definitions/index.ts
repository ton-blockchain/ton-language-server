import * as lsp from "vscode-languageserver"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {asLspRange} from "@server/utils/position"
import {Reference} from "@server/languages/tolk/psi/Reference"
import {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import {ImportResolver} from "@server/languages/tolk/psi/ImportResolver"
import {filePathToUri} from "@server/files"
import {NamedTy} from "@server/languages/tolk/types/ty"
import {globalVFS} from "@server/vfs/global"
import {existsVFS} from "@server/vfs/files-adapter"
import {typeOf} from "@server/languages/tolk/type-inference"

export async function provideTolkDefinition(
    hoverNode: SyntaxNode,
    file: TolkFile,
): Promise<lsp.Location[] | lsp.LocationLink[]> {
    if (hoverNode.type === "string_literal" && hoverNode.parent?.type === "import_directive") {
        return resolveImport(file, hoverNode)
    }

    if (hoverNode.type !== "identifier" && hoverNode.type !== "type_identifier") {
        return []
    }

    const element = NamedNode.create(hoverNode, file)
    const resolved = Reference.multiResolve(element)
    if (resolved.length === 0) {
        console.warn(`Cannot find definition for: ${hoverNode.text}`)
        return []
    }
    if (resolved.length > 1) {
        return resolved.flatMap(res => {
            const ident = res.nameIdentifier()
            if (ident === null) return []

            return [
                {
                    uri: res.file.uri,
                    range: asLspRange(ident),
                },
            ]
        })
    }

    const res = resolved.at(0)
    if (!res) {
        console.warn(`Cannot find definition for: ${hoverNode.text}`)
        return []
    }

    const ident = res.nameIdentifier()
    if (ident === null) return []

    return [
        {
            uri: res.file.uri,
            range: asLspRange(ident),
        },
    ]
}

export function provideTolkTypeDefinition(
    hoverNode: SyntaxNode,
    file: TolkFile,
): lsp.Definition | lsp.DefinitionLink[] {
    if (hoverNode.type !== "identifier" && hoverNode.type !== "type_identifier") {
        return []
    }

    const type = typeOf(hoverNode, file)
    if (type === null) {
        console.error(`Cannot infer type for Go to Type Definition for: ${hoverNode.text}`)
        return []
    }
    if (!(type instanceof NamedTy)) return []

    const anchor = type.anchor as NamedNode
    const name = anchor.nameIdentifier()
    if (name === null) return []

    return [
        {
            uri: anchor.file.uri,
            range: asLspRange(name),
        },
    ]
}

async function resolveImport(file: TolkFile, hoverNode: SyntaxNode): Promise<lsp.LocationLink[]> {
    const importedFile = ImportResolver.resolveNode(file, hoverNode)
    if (!importedFile) return []

    const importedFileUri = filePathToUri(importedFile)
    const exists = await existsVFS(globalVFS, importedFileUri)
    if (!exists) return []

    const startOfFile = {
        start: {line: 0, character: 0},
        end: {line: 0, character: 0},
    }

    const hoverRange = asLspRange(hoverNode)
    return [
        {
            targetUri: importedFileUri,
            targetRange: startOfFile,
            targetSelectionRange: startOfFile,
            originSelectionRange: {
                start: {
                    line: hoverRange.start.line,
                    character: hoverRange.start.character + 1,
                },
                end: {
                    line: hoverRange.end.line,
                    character: hoverRange.end.character - 1,
                },
            },
        },
    ]
}
