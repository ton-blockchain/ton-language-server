//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as lsp from "vscode-languageserver"

import {FuncFile} from "@server/languages/func/psi/FuncFile"

export const InspectionIds = {
    UNUSED_PARAMETER: "unused-parameter",
    UNUSED_TYPE_PARAMETER: "unused-type-parameter",
    UNUSED_VARIABLE: "unused-variable",
    UNUSED_IMPORT: "unused-import",
} as const

export type InspectionId = (typeof InspectionIds)[keyof typeof InspectionIds]

export interface Inspection {
    readonly id: InspectionId
    inspect(file: FuncFile): Promise<lsp.Diagnostic[]> | lsp.Diagnostic[]
}
