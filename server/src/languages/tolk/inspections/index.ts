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
import {UnusedTypeParameterInspection} from "@server/languages/tolk/inspections/UnusedTypeParameterInspection"
import {NeedNotNullUnwrappingInspection} from "@server/languages/tolk/inspections/NeedNotNullUnwrappingInspection"
import {MissedSemicolonInspection} from "@server/languages/tolk/inspections/MissedSemicolonInspection"
import {CallArgumentsCountMismatchInspection} from "@server/languages/tolk/inspections/CallArgumentsCountMismatchInspection"

export async function runTolkInspections(
    uri: string,
    file: TolkFile,
    _includeLinters: boolean,
): Promise<void> {
    const inspections = [
        new UnusedParameterInspection(),
        new UnusedTypeParameterInspection(),
        new UnusedVariableInspection(),
        new UnusedImportInspection(),
        new UnusedTopLevelDeclarationInspection(),
        new DeprecatedSymbolUsageInspection(),
        new StructInitializationInspection(),
        new TypeCompatibilityInspection(),
        new CannotReassignInspection(),
        new NeedNotNullUnwrappingInspection(),
        new MissedSemicolonInspection(),
        new CallArgumentsCountMismatchInspection(),
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
