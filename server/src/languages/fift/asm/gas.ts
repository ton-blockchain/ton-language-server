//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio

export function instructionPresentation(
    gas: string | undefined,
    stack: string,
    format: string,
): string {
    if (!gas || gas === "") {
        return ": no data"
    }
    return format.replace("{gas}", gas).replace("{stack}", stack)
}
