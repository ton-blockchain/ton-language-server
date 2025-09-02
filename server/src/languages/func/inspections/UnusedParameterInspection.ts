//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type * as lsp from "vscode-languageserver"
import type {FuncFile} from "@server/languages/func/psi/FuncFile"
import {UnusedInspection} from "./UnusedInspection"
import {Inspection, InspectionIds} from "./Inspection"
import {Func} from "@server/languages/func/psi/Decls"

export class UnusedParameterInspection extends UnusedInspection implements Inspection {
    public readonly id: "unused-parameter" = InspectionIds.UNUSED_PARAMETER

    protected checkFile(file: FuncFile, diagnostics: lsp.Diagnostic[]): void {
        for (const fun of file.getFunctions()) {
            this.inspectFunction(fun, diagnostics)
        }
    }

    private inspectFunction(fun: Func, diagnostics: lsp.Diagnostic[]): void {
        if (fun.node.childForFieldName("asm_body") !== null) return // skip assembly functions

        for (const param of fun.parameters()) {
            const nameIdent = param.nameIdentifier()
            if (!nameIdent) continue

            this.checkUnused(param.nameIdentifier(), fun.file, diagnostics, {
                kind: "Parameter",
                code: "unused-parameter",
                rangeNode: nameIdent,
            })
        }
    }
}
