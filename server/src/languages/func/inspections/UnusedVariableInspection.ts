//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type * as lsp from "vscode-languageserver"

import type {FuncFile} from "@server/languages/func/psi/FuncFile"

import {RecursiveVisitor} from "@server/visitor/visitor"

import {UnusedInspection} from "./UnusedInspection"
import {Inspection, InspectionIds} from "./Inspection"

export class UnusedVariableInspection extends UnusedInspection implements Inspection {
    public readonly id: "unused-variable" = InspectionIds.UNUSED_VARIABLE

    protected checkFile(file: FuncFile, diagnostics: lsp.Diagnostic[]): void {
        RecursiveVisitor.visit(file.rootNode, (node): boolean => {
            if (node.type !== "var_declaration") {
                return true
            }

            const nameNode = node.childForFieldName("name")
            if (!nameNode) return true
            this.checkUnused(nameNode, file, diagnostics, {
                kind: "Variable",
                code: "unused-variable",
            })

            return true
        })
    }
}
