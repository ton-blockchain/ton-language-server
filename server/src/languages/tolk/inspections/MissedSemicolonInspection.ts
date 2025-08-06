//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {Inspection, InspectionIds} from "./Inspection"
import {RecursiveVisitor} from "@server/visitor/visitor"
import {asLspRange} from "@server/utils/position"

export class MissedSemicolonInspection implements Inspection {
    public readonly id: "missed-semicolon" = InspectionIds.MISSED_SEMICOLON

    public inspect(file: TolkFile): lsp.Diagnostic[] {
        if (file.fromStdlib) return []
        const diagnostics: lsp.Diagnostic[] = []
        this.checkFile(file, diagnostics)
        return diagnostics
    }

    protected checkFile(file: TolkFile, diagnostics: lsp.Diagnostic[]): void {
        RecursiveVisitor.visit(file.rootNode, (node): boolean => {
            if (node.type === "block_statement") {
                const statements = node.namedChildren.filter(it => it?.type !== "comment")
                for (const [index, stmt] of statements.entries()) {
                    if (!stmt) break
                    const stmtType = stmt.type

                    if (
                        stmtType === "local_vars_declaration" ||
                        stmtType === "return_statement" ||
                        stmtType === "do_while_statement" ||
                        stmtType === "break_statement" ||
                        stmtType === "continue_statement" ||
                        stmtType === "throw_statement" ||
                        stmtType === "assert_statement" ||
                        stmtType === "expression_statement"
                    ) {
                        const nextSibling = stmt.nextSibling
                        if (nextSibling?.text !== ";" && index !== statements.length - 1) {
                            const stmtRange = asLspRange(stmt)
                            diagnostics.push({
                                severity: lsp.DiagnosticSeverity.Error,
                                range: {
                                    start: {
                                        line: stmtRange.end.line,
                                        character: stmtRange.end.character,
                                    },
                                    end: {
                                        line: stmtRange.end.line,
                                        character: stmtRange.end.character,
                                    },
                                },
                                message: `Missed \`;\` at end of statement`,
                                source: "tolk",
                                code: "parser",
                            })
                        }
                    }
                }
            }
            return true
        })
    }
}
