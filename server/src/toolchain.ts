//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {fallbackToolchain, Toolchain} from "@server/languages/tolk/toolchain/toolchain"

export let toolchain: Toolchain = fallbackToolchain

export function setToolchain(chain: Toolchain): void {
    toolchain = chain
}

export let workspaceRoot: string = ""

export function setWorkspaceRoot(path: string): void {
    console.info(`Set ${path} as workspace root `)
    workspaceRoot = path
}
