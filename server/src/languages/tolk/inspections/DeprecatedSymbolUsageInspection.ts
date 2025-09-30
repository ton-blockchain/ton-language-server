//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver"

import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"

import {RecursiveVisitor} from "@server/visitor/visitor"
import {Reference} from "@server/languages/tolk/psi/Reference"
import {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import {asLspRange} from "@server/utils/position"

import {Inspection, InspectionIds} from "./Inspection"

export class DeprecatedSymbolUsageInspection implements Inspection {
    public readonly id: "deprecated-symbol-usage" = InspectionIds.DEPRECATED_SYMBOL_USAGE

    public inspect(file: TolkFile): lsp.Diagnostic[] {
        if (file.fromStdlib) return []
        const diagnostics: lsp.Diagnostic[] = []
        this.checkFile(file, diagnostics)
        return diagnostics
    }

    protected checkFile(file: TolkFile, diagnostics: lsp.Diagnostic[]): void {
        RecursiveVisitor.visit(file.rootNode, (node): boolean => {
            if (node.type !== "identifier" && node.type !== "type_identifier") return true

            const resolved = Reference.resolve(new NamedNode(node, file))
            if (!resolved) return true

            if (resolved.isDeprecated()) {
                const notice = resolved.deprecationNotice()
                const noticePresentation = notice ? `: ${notice}` : ""

                diagnostics.push({
                    severity: lsp.DiagnosticSeverity.Hint,
                    tags: [lsp.DiagnosticTag.Deprecated],
                    range: asLspRange(node),
                    message: `Symbol \`${resolved.namePresentation()}\` is deprecated${noticePresentation}`,
                    source: "tolk",
                })
            }

            return true
        })
    }
}
