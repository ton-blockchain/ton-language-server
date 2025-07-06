//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {Toolchain} from "@server/languages/tolk/toolchain/toolchain"
import {ToolchainConfig} from "@server/settings/settings"

interface ToolchainManagerState {
    readonly toolchains: Map<string, Toolchain>
    readonly activeToolchainId: string
    readonly workspaceRoot: string | undefined
}

let state: ToolchainManagerState = {
    toolchains: new Map(),
    activeToolchainId: "auto",
    workspaceRoot: undefined,
}

export function setWorkspaceRoot(root: string): void {
    state = {
        ...state,
        workspaceRoot: root,
    }
}

export async function setToolchains(
    toolchainConfigs: Record<string, ToolchainConfig>,
    activeId: string,
): Promise<void> {
    const newToolchains: Map<string, Toolchain> = new Map()

    for (const [id, config] of Object.entries(toolchainConfigs)) {
        try {
            const toolchain =
                id === "auto" && config.path === ""
                    ? await Toolchain.autoDetect(state.workspaceRoot ?? process.cwd())
                    : Toolchain.fromPath(config.path)

            newToolchains.set(id, toolchain)
        } catch (error) {
            console.error(`Failed to initialize toolchain ${id}:`, error)
        }
    }

    state = {
        ...state,
        toolchains: newToolchains,
        activeToolchainId: activeId,
    }
}

export function getActiveToolchain(): Toolchain | null {
    return state.toolchains.get(state.activeToolchainId) ?? null
}

export function getActiveToolchainId(): string {
    return state.activeToolchainId
}
