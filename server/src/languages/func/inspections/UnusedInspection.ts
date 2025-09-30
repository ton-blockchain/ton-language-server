//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as lsp from "vscode-languageserver"

import type {Node as SyntaxNode} from "web-tree-sitter"

import type {FuncFile} from "@server/languages/func/psi/FuncFile"
import {asLspRange} from "@server/utils/position"
import {Referent} from "@server/languages/func/psi/Referent"

export abstract class UnusedInspection {
    public inspect(file: FuncFile): lsp.Diagnostic[] {
        if (file.fromStdlib) return []
        const diagnostics: lsp.Diagnostic[] = []
        this.checkFile(file, diagnostics)
        return diagnostics
    }

    protected abstract checkFile(file: FuncFile, diagnostics: lsp.Diagnostic[]): void

    protected checkUnused(
        node: SyntaxNode | null,
        file: FuncFile,
        diagnostics: lsp.Diagnostic[],
        options: {
            kind: string
            severity?: lsp.DiagnosticSeverity
            code?: string
            rangeNode?: SyntaxNode | null
            skipIf?: () => boolean
        },
    ): void {
        if (!node || node.text === "_" || node.text.startsWith("_")) return

        const references = new Referent(node, file).findReferences({limit: 1}) // we need at least one reference
        if (references.length === 0) {
            const range = asLspRange(options.rangeNode ?? node)

            if (options.skipIf && options.skipIf()) {
                return
            }

            diagnostics.push({
                severity: options.severity ?? lsp.DiagnosticSeverity.Hint,
                range,
                message: `${options.kind} '${node.text}' is never used`,
                source: "func",
                code: options.code ?? "unused",
                tags: [lsp.DiagnosticTag.Unnecessary],
            })
        }
    }
}
