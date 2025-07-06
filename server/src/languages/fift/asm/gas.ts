//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {getStackPresentation} from "./types"

export function instructionPresentation(
    gas: string | undefined,
    stack: string | undefined,
    format: string,
): string {
    if (!gas || gas === "") {
        return ": no data"
    }
    return format.replace("{gas}", gas).replace("{stack}", getStackPresentation(stack))
}
