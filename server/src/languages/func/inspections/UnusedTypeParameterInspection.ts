//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type * as lsp from "vscode-languageserver"

import type {FuncFile} from "@server/languages/func/psi/FuncFile"

import {TypeParameter} from "@server/languages/func/psi/Decls"

import {UnusedInspection} from "./UnusedInspection"
import {Inspection, InspectionIds} from "./Inspection"

export class UnusedTypeParameterInspection extends UnusedInspection implements Inspection {
    public readonly id: "unused-type-parameter" = InspectionIds.UNUSED_TYPE_PARAMETER

    protected checkFile(file: FuncFile, diagnostics: lsp.Diagnostic[]): void {
        for (const fun of file.getFunctions()) {
            this.checkTypeParameters(fun.typeParameters(), diagnostics)
        }
    }

    private checkTypeParameters(parameters: TypeParameter[], diagnostics: lsp.Diagnostic[]): void {
        for (const param of parameters) {
            const name = param.nameIdentifier()
            if (!name) continue

            this.checkUnused(name, param.file, diagnostics, {
                kind: "Type parameter",
                code: "unused-type-parameter",
                rangeNode: name,
            })
        }
    }
}
