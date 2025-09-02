import * as lsp from "vscode-languageserver"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {asLspRange} from "@server/utils/position"
import {FuncFile} from "@server/languages/func/psi/FuncFile"
import {Reference} from "@server/languages/func/psi/Reference"
import {NamedNode} from "@server/languages/func/psi/FuncNode"
import {ImportResolver} from "@server/languages/func/psi/ImportResolver"
import {filePathToUri} from "@server/files"
import {existsVFS, globalVFS} from "@server/vfs/files-adapter"

export async function provideFuncDefinition(
    hoverNode: SyntaxNode,
    file: FuncFile,
): Promise<lsp.Location[] | lsp.LocationLink[]> {
    if (hoverNode.type === "string_literal" && hoverNode.parent?.type === "import_directive") {
        return resolveImport(file, hoverNode)
    }

    if (hoverNode.type !== "identifier" && hoverNode.type !== "type_identifier") {
        return []
    }

    const element = NamedNode.create(hoverNode, file)
    const res = Reference.resolve(element)
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

async function resolveImport(file: FuncFile, hoverNode: SyntaxNode): Promise<lsp.LocationLink[]> {
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
