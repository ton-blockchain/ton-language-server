//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type * as lsp from "vscode-languageserver"

import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"

import {Func, FunctionKind} from "@server/languages/tolk/psi/Decls"

import {UnusedInspection} from "./UnusedInspection"
import {Inspection, InspectionIds} from "./Inspection"

export class UnusedParameterInspection extends UnusedInspection implements Inspection {
    public readonly id: "unused-parameter" = InspectionIds.UNUSED_PARAMETER

    protected checkFile(file: TolkFile, diagnostics: lsp.Diagnostic[]): void {
        for (const fun of file.getFunctions()) {
            this.inspectFunction(fun, diagnostics)
        }
    }

    private inspectFunction(fun: Func, diagnostics: lsp.Diagnostic[]): void {
        if (fun.kind() !== FunctionKind.Common) return

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
