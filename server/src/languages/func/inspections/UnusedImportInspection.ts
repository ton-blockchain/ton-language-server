//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver"
import type {FuncFile} from "@server/languages/func/psi/FuncFile"
import {asLspRange} from "@server/utils/position"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {ImportResolver} from "@server/languages/func/psi/ImportResolver"
import {Inspection, InspectionIds} from "./Inspection"

export class UnusedImportInspection implements Inspection {
    public readonly id: "unused-import" = InspectionIds.UNUSED_IMPORT

    public inspect(file: FuncFile): lsp.Diagnostic[] {
        if (file.fromStdlib) return []
        const diagnostics: lsp.Diagnostic[] = []

        const imports: Map<
            string,
            {
                node: SyntaxNode
                names: Set<string>
            }
        > = new Map()

        const importNodes = file.imports()

        for (const imp of importNodes) {
            const pathNode = imp.childForFieldName("path")
            if (!pathNode) continue

            const importPath = pathNode.text.slice(1, -1)
            const importedFile = ImportResolver.resolveAsFile(file, pathNode)
            if (!importedFile) continue

            const decls = importedFile.getDecls()

            const names: Set<string> = new Set()
            for (const d of decls) {
                names.add(d.name())
            }

            imports.set(importPath, {
                node: imp,
                names,
            })
        }

        for (const [importPath, {node, names}] of imports) {
            if (!UnusedImportInspection.usedInFile(names, file)) {
                diagnostics.push({
                    severity: lsp.DiagnosticSeverity.Hint,
                    range: asLspRange(node),
                    message: `Include '${importPath}' is never used`,
                    source: "func",
                    code: "unused-include",
                    tags: [lsp.DiagnosticTag.Unnecessary],
                })
            }
        }

        return diagnostics
    }

    private static usedInFile(names: Set<string>, file: FuncFile): boolean {
        const lines = file.content.split(/\r?\n/)

        for (const line of lines) {
            for (const name of names) {
                if (line.includes(";;")) {
                    // handle cases like this:
                    // ```
                    // bar(); // comment about bar
                    // ```
                    const beforeComment = line.slice(0, line.indexOf("//"))
                    if (beforeComment.includes(name)) {
                        return true
                    }
                    continue
                }

                if (line.includes(name)) {
                    return true
                }
            }
        }
        return false
    }
}
