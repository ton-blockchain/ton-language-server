//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as lsp from "vscode-languageserver"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"

export const InspectionIds = {
    UNUSED_PARAMETER: "unused-parameter",
    UNUSED_VARIABLE: "unused-variable",
    UNUSED_TOP_LEVEL_DECLARATION: "unused-top-level-declaration",
    DEPRECATED_SYMBOL_USAGE: "deprecated-symbol-usage",
    UNUSED_IMPORT: "unused-import",
    STRUCT_INITIALIZATION: "struct-initialization",
    TYPE_COMPATIBILITY: "type-compatibility",
    CANNOT_REASSIGN: "cannot-reassign",
} as const

export type InspectionId = (typeof InspectionIds)[keyof typeof InspectionIds]

export interface Inspection {
    readonly id: InspectionId
    inspect(file: TolkFile): Promise<lsp.Diagnostic[]> | lsp.Diagnostic[]
}
