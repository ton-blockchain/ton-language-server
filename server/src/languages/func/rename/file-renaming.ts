//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {RenameFilesParams} from "vscode-languageserver"
import * as lsp from "vscode-languageserver"
import {ImportResolver} from "@server/languages/func/psi/ImportResolver"
import {asLspRange} from "@server/utils/position"
import {TextEdit} from "vscode-languageserver-types"
import {index} from "@server/languages/func/indexes"
import {filePathToUri, findFuncFile, FUNC_PARSED_FILES_CACHE} from "@server/files"
import {FuncFile} from "@server/languages/func/psi/FuncFile"

export async function processFuncFileRenaming(
    params: RenameFilesParams,
): Promise<lsp.WorkspaceEdit | null> {
    const changes: Record<lsp.DocumentUri, lsp.TextEdit[]> = {}

    for (const fileRename of params.files) {
        await processFileRename(fileRename, changes)
    }

    return Object.keys(changes).length > 0 ? {changes} : null
}

export function onFuncFileRenamed(params: RenameFilesParams): void {
    for (const fileRename of params.files) {
        const oldUri = fileRename.oldUri
        const newUri = fileRename.newUri

        if (!oldUri.endsWith(".fc") || !newUri.endsWith(".func")) {
            continue
        }

        console.info(`File renamed from ${oldUri} to ${newUri}`)

        const file = FUNC_PARSED_FILES_CACHE.get(oldUri)
        if (file) {
            FUNC_PARSED_FILES_CACHE.delete(oldUri)
            const newFile = new FuncFile(newUri, file.tree, file.content)
            FUNC_PARSED_FILES_CACHE.set(newUri, newFile)

            index.removeFile(oldUri)
            index.addFile(newUri, newFile)
        }
    }
}

async function processFileRename(
    fileRename: lsp.FileRename,
    changes: Record<string, TextEdit[]>,
): Promise<void> {
    const oldUri = fileRename.oldUri
    const newUri = fileRename.newUri

    if (!oldUri.endsWith(".fc") && !newUri.endsWith(".func")) {
        return
    }

    console.info(`Processing rename from ${oldUri} to ${newUri}`)

    // Update imports in the renamed file itself
    const renamedFile = FUNC_PARSED_FILES_CACHE.get(oldUri)
    if (renamedFile) {
        const edits: lsp.TextEdit[] = []
        const newFile = new FuncFile(newUri, renamedFile.tree, renamedFile.content)

        const imports = renamedFile.imports()
        for (const importNode of imports) {
            const pathNode = importNode.childForFieldName("path")
            if (!pathNode) continue

            const importPath = pathNode.text.slice(1, -1) // without quotes
            const resolvedPath = ImportResolver.resolveImport(renamedFile, importPath)
            if (!resolvedPath) continue

            const targetFile = FUNC_PARSED_FILES_CACHE.get(filePathToUri(resolvedPath))
            if (targetFile) {
                const newImportPath = targetFile.importPath(newFile)
                const range = asLspRange(pathNode)

                if (newImportPath !== importPath) {
                    edits.push({
                        range,
                        newText: `"${newImportPath}"`,
                    })

                    console.info(
                        `Updating import in renamed file ${newUri}: "${importPath}" -> "${newImportPath}"`,
                    )
                }
            }
        }

        if (edits.length > 0) {
            changes[oldUri] = edits
        }
    }

    // Update imports in other files that reference the renamed file
    for (const [uri, file] of FUNC_PARSED_FILES_CACHE.entries()) {
        if (uri === oldUri) continue // skip the file being renamed

        const imports = file.imports()
        const edits: lsp.TextEdit[] = []

        for (const importNode of imports) {
            const pathNode = importNode.childForFieldName("path")
            if (!pathNode) continue

            const importPath = pathNode.text.slice(1, -1) // without quotes
            const resolvedPath = ImportResolver.resolveImport(file, importPath)

            if (!resolvedPath || filePathToUri(resolvedPath) !== oldUri) {
                continue
            }

            const oldFile = await findFuncFile(oldUri)
            const newFile = new FuncFile(newUri, oldFile.tree, oldFile.content)
            const newImportPath = newFile.importPath(file)
            const range = asLspRange(pathNode)

            edits.push({
                range,
                newText: `"${newImportPath}"`,
            })

            console.info(`Updating import in ${uri}: "${importPath}" -> "${newImportPath}"`)
        }

        if (edits.length > 0) {
            changes[uri] = edits
        }
    }
}
