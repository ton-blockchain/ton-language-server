//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"

import {RecursiveVisitor} from "@server/visitor/visitor"
import {Reference} from "@server/languages/tolk/psi/Reference"
import {NamedNode, VarDeclaration} from "@server/languages/tolk/psi/TolkNode"
import {asLspRange} from "@server/utils/position"

import {Inspection, InspectionIds} from "./Inspection"

export class CannotReassignInspection implements Inspection {
    public readonly id: "cannot-reassign" = InspectionIds.CANNOT_REASSIGN

    public inspect(file: TolkFile): lsp.Diagnostic[] {
        if (file.fromStdlib) return []
        const diagnostics: lsp.Diagnostic[] = []
        this.checkFile(file, diagnostics)
        return diagnostics
    }

    protected checkFile(file: TolkFile, diagnostics: lsp.Diagnostic[]): void {
        RecursiveVisitor.visit(file.rootNode, (node): boolean => {
            if (node.type === "assignment" || node.type === "set_assignment") {
                const left = node.childForFieldName("left")
                if (!left) return true

                if (left.type === "identifier") {
                    const resolved = Reference.resolve(new NamedNode(left, file))
                    if (!resolved) return true

                    if (resolved.node.type === "parameter_declaration") {
                        // parameter can be always reassigned
                        return true
                    }

                    if (resolved.node.type === "var_declaration") {
                        const decl = new VarDeclaration(resolved.node, file)
                        const isMutable = decl.varsDeclaration()?.kind() === "var"
                        if (isMutable) {
                            // ok to reassign mutable variable
                            return true
                        }

                        diagnostics.push({
                            severity: lsp.DiagnosticSeverity.Error,
                            range: asLspRange(node),
                            message: `Cannot reassign immutable variable "${resolved.name()}"`,
                            source: "tolk",
                        })
                    }

                    if (resolved.node.type === "constant_declaration") {
                        diagnostics.push({
                            severity: lsp.DiagnosticSeverity.Error,
                            range: asLspRange(node),
                            message: `Cannot reassign constant "${resolved.name()}"`,
                            source: "tolk",
                        })
                    }
                }
            }

            return true
        })
    }
}
