//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type {InlayHint} from "vscode-languageserver"

import {InlayHintKind} from "vscode-languageserver-types"

import {RecursiveVisitor} from "@server/visitor/visitor"
import {FiftFile} from "@server/languages/fift/psi/FiftFile"
import {findInstruction, formatGasRanges} from "@server/languages/fift/asm/types"
import {instructionPresentation} from "@server/languages/fift/asm/gas"

// eslint-disable-next-line @typescript-eslint/require-await
export async function provideFiftInlayHints(
    file: FiftFile,
    gasFormat: string,
    settings: {
        showGasConsumption: boolean
    },
): Promise<InlayHint[]> {
    const result: InlayHint[] = []

    RecursiveVisitor.visit(file.rootNode, (n): boolean => {
        if (n.type === "identifier" && settings.showGasConsumption) {
            const instruction = findInstruction(n.text)
            if (!instruction) return true

            const gas = formatGasRanges(instruction.instruction.description.gas)
            const stack = instruction.instruction.signature?.stack_string ?? ""

            const presentation = instructionPresentation(gas, stack, gasFormat)

            result.push({
                kind: InlayHintKind.Type,
                label: presentation,
                position: {
                    line: n.endPosition.row,
                    character: n.endPosition.column,
                },
            })
        }
        return true
    })

    return result
}
