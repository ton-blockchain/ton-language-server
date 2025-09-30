//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver"

import type {FuncFile} from "@server/languages/func/psi/FuncFile"
import {asLspRange} from "@server/utils/position"
import {ImportResolver} from "@server/languages/func/psi/ImportResolver"

import {FUNC_PARSED_FILES_CACHE} from "@server/files"

import {Inspection, InspectionIds} from "./Inspection"

interface DependencyGraph {
    readonly fileToSymbols: Map<FuncFile, Set<string>>
    readonly fileToTransitiveSymbols: Map<FuncFile, Set<string>>
}

export class UnusedImportInspection implements Inspection {
    public readonly id: "unused-import" = InspectionIds.UNUSED_IMPORT

    public inspect(file: FuncFile): lsp.Diagnostic[] {
        if (file.fromStdlib) return []
        const diagnostics: lsp.Diagnostic[] = []

        const dependencyGraph = this.buildDependencyGraph(file)
        const filesImportingThis = this.findFilesImporting(file)

        const importNodes = file.imports()

        for (const imp of importNodes) {
            const pathNode = imp.childForFieldName("path")
            if (!pathNode) continue

            const importPath = pathNode.text.slice(1, -1)
            const importedFile = ImportResolver.resolveAsFile(file, pathNode)
            if (!importedFile) continue

            // Skip standard library files
            if (importedFile.name === "stdlib.fc" || importedFile.name === "stdlib.func") {
                continue
            }

            if (!this.isIncludeUsed(file, importedFile, dependencyGraph, filesImportingThis)) {
                diagnostics.push({
                    severity: lsp.DiagnosticSeverity.Hint,
                    range: asLspRange(imp),
                    message: `Include '${importPath}' is never used`,
                    source: "func",
                    code: "unused-include",
                    tags: [lsp.DiagnosticTag.Unnecessary],
                })
            }
        }

        return diagnostics
    }

    private findFilesImporting(targetFile: FuncFile): Set<FuncFile> {
        const importingFiles: Set<FuncFile> = new Set()
        const allFuncFiles = [...FUNC_PARSED_FILES_CACHE.values()]

        for (const file of allFuncFiles) {
            if (file === targetFile) continue

            for (const imp of file.imports()) {
                const pathNode = imp.childForFieldName("path")
                if (!pathNode) continue

                const importedFile = ImportResolver.resolveAsFile(file, pathNode)
                if (importedFile === targetFile) {
                    importingFiles.add(file)
                    break
                }
            }
        }

        return importingFiles
    }

    private buildDependencyGraph(rootFile: FuncFile): DependencyGraph {
        const fileToSymbols: Map<FuncFile, Set<string>> = new Map()
        const fileToTransitiveSymbols: Map<FuncFile, Set<string>> = new Map()
        const visited: Set<FuncFile> = new Set()

        this.collectAllFilesRecursive(rootFile, visited)

        for (const file of visited) {
            fileToSymbols.set(file, this.collectDirectSymbols(file))
        }

        for (const file of visited) {
            fileToTransitiveSymbols.set(
                file,
                this.computeTransitiveSymbols(file, fileToSymbols, new Map()),
            )
        }

        return {fileToSymbols, fileToTransitiveSymbols}
    }

    private collectAllFilesRecursive(file: FuncFile, visited: Set<FuncFile>): void {
        if (visited.has(file)) return
        visited.add(file)

        for (const imp of file.imports()) {
            const pathNode = imp.childForFieldName("path")
            if (!pathNode) continue

            const includedFile = ImportResolver.resolveAsFile(file, pathNode)
            if (!includedFile) continue

            this.collectAllFilesRecursive(includedFile, visited)
        }
    }

    private collectDirectSymbols(file: FuncFile): Set<string> {
        const symbols: Set<string> = new Set()

        for (const func of file.getFunctions()) {
            const name = func.name()
            if (name) symbols.add(name)
        }

        for (const constVar of file.getConstants()) {
            const name = constVar.name()
            if (name) symbols.add(name)
        }

        for (const globalVar of file.getGlobalVariables()) {
            const name = globalVar.name()
            if (name) symbols.add(name)
        }

        return symbols
    }

    private computeTransitiveSymbols(
        file: FuncFile,
        fileToSymbols: Map<FuncFile, Set<string>>,
        memo: Map<FuncFile, Set<string>>,
    ): Set<string> {
        const memoResult = memo.get(file)
        if (memoResult) {
            return memoResult
        }

        const allSymbols: Set<string> = new Set()

        const directSymbols = fileToSymbols.get(file)
        if (directSymbols) {
            for (const symbol of directSymbols) {
                allSymbols.add(symbol)
            }
        }

        for (const imp of file.imports()) {
            const pathNode = imp.childForFieldName("path")
            if (!pathNode) continue

            const includedFile = ImportResolver.resolveAsFile(file, pathNode)
            if (!includedFile || includedFile === file) continue

            const transitiveSymbols = this.computeTransitiveSymbols(
                includedFile,
                fileToSymbols,
                memo,
            )
            for (const symbol of transitiveSymbols) {
                allSymbols.add(symbol)
            }
        }

        memo.set(file, allSymbols)
        return allSymbols
    }

    private isIncludeUsed(
        mainFile: FuncFile,
        includedFile: FuncFile,
        graph: DependencyGraph,
        filesImportingMain: Set<FuncFile>,
    ): boolean {
        const availableSymbols =
            graph.fileToTransitiveSymbols.get(includedFile) ?? new Set<string>()
        if (availableSymbols.size === 0) return false

        if (this.usedInFile(mainFile, availableSymbols)) {
            return true
        }

        for (const importingFile of filesImportingMain) {
            if (this.usedInFile(importingFile, availableSymbols)) {
                return true
            }
        }

        return false
    }

    private usedInFile(file: FuncFile, names: Set<string>): boolean {
        if (names.size === 0) return false

        const lines = file.content.split(/\r?\n/)
        for (const line of lines) {
            let effectiveLine: string
            if (line.includes(";;")) {
                effectiveLine = line.slice(0, line.indexOf(";;"))
            } else if (line.includes("{-")) {
                effectiveLine = line.slice(0, line.indexOf("{-"))
            } else {
                effectiveLine = line
            }

            for (const name of names) {
                if (effectiveLine.includes(name)) {
                    return true
                }
            }
        }

        return false
    }
}
