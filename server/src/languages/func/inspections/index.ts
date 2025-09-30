import * as lsp from "vscode-languageserver"

import {connection} from "@server/connection"
import {getDocumentSettings} from "@server/settings/settings"
import {FuncFile} from "@server/languages/func/psi/FuncFile"
import {UnusedParameterInspection} from "@server/languages/func/inspections/UnusedParameterInspection"
import {UnusedVariableInspection} from "@server/languages/func/inspections/UnusedVariableInspection"
import {UnusedImportInspection} from "@server/languages/func/inspections/UnusedImportInspection"
import {UnusedTypeParameterInspection} from "@server/languages/func/inspections/UnusedTypeParameterInspection"

export async function runFuncInspections(
    uri: string,
    file: FuncFile,
    _includeLinters: boolean,
): Promise<void> {
    const inspections = [
        new UnusedParameterInspection(),
        new UnusedTypeParameterInspection(),
        new UnusedVariableInspection(),
        new UnusedImportInspection(),
    ]

    const settings = await getDocumentSettings(uri)
    const diagnostics: lsp.Diagnostic[] = []

    for (const inspection of inspections) {
        if (settings.func.inspections.disabled.includes(inspection.id)) {
            continue
        }
        diagnostics.push(...inspection.inspect(file))
    }

    await connection.sendDiagnostics({uri, diagnostics})
}
