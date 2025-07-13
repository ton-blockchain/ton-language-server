//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import {defaultConfig, TonPluginConfigScheme} from "@shared/config-scheme"

let cachedClientConfig: TonPluginConfigScheme | null = null

export function getClientConfiguration(): TonPluginConfigScheme {
    if (cachedClientConfig) {
        return cachedClientConfig
    }

    const obj = {} as Record<string, unknown>
    const w = vscode.workspace.getConfiguration("ton")
    for (const key in defaultConfig) {
        const value = w.get(key)
        if (value !== undefined) {
            obj[key] = value
        }
    }

    cachedClientConfig = obj as TonPluginConfigScheme
    return cachedClientConfig
}

export function resetClientConfigCache(): void {
    cachedClientConfig = null
}
