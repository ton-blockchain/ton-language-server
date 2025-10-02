//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type * as lsp from "vscode-languageserver"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"

import {TypeParameter} from "@server/languages/tolk/psi/Decls"

import {UnusedInspection} from "./UnusedInspection"
import {Inspection, InspectionIds} from "./Inspection"

export class UnusedTypeParameterInspection extends UnusedInspection implements Inspection {
    public readonly id: "unused-type-parameter" = InspectionIds.UNUSED_TYPE_PARAMETER

    protected checkFile(file: TolkFile, diagnostics: lsp.Diagnostic[]): void {
        for (const fun of file.getFunctions()) {
            this.checkTypeParameters(fun.typeParameters(), diagnostics)
        }
        for (const method of file.getMethods()) {
            this.checkTypeParameters(method.typeParameters(), diagnostics)
        }
        for (const struct of file.getStructs()) {
            this.checkTypeParameters(struct.typeParameters(), diagnostics)
        }
        for (const alias of file.getTypeAliases()) {
            this.checkTypeParameters(alias.typeParameters(), diagnostics)
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
