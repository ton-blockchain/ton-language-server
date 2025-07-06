import * as lsp from "vscode-languageserver"
import {connection} from "@server/connection"
import {getDocumentSettings} from "@server/settings/settings"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {UnusedParameterInspection} from "@server/languages/tolk/inspections/UnusedParameterInspection"
import {UnusedVariableInspection} from "@server/languages/tolk/inspections/UnusedVariableInspection"
import {DeprecatedSymbolUsageInspection} from "@server/languages/tolk/inspections/DeprecatedSymbolUsageInspection"
import {UnusedImportInspection} from "@server/languages/tolk/inspections/UnusedImportInspection"
import {StructInitializationInspection} from "@server/languages/tolk/inspections/StructInitializationInspection"
import {TypeCompatibilityInspection} from "@server/languages/tolk/inspections/TypeCompatibilityInspection"
import {CannotReassignInspection} from "@server/languages/tolk/inspections/CannotReassignInspection"
import {UnusedTopLevelDeclarationInspection} from "@server/languages/tolk/inspections/UnusedTopLevelDeclarationInspection"

export async function runTolkInspections(
    uri: string,
    file: TolkFile,
    _includeLinters: boolean,
): Promise<void> {
    const inspections = [
        new UnusedParameterInspection(),
        new UnusedVariableInspection(),
        new UnusedImportInspection(),
        new UnusedTopLevelDeclarationInspection(),
        new DeprecatedSymbolUsageInspection(),
        new StructInitializationInspection(),
        new TypeCompatibilityInspection(),
        new CannotReassignInspection(),
    ]

    const settings = await getDocumentSettings(uri)
    const diagnostics: lsp.Diagnostic[] = []

    for (const inspection of inspections) {
        if (settings.tolk.inspections.disabled.includes(inspection.id)) {
            continue
        }
        diagnostics.push(...inspection.inspect(file))
    }

    await connection.sendDiagnostics({uri, diagnostics})
}
