//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type * as lsp from "vscode-languageserver"

export const TypeAtPositionRequest = "tolk.getTypeAtPosition"
export const DocumentationAtPositionRequest = "tolk.executeHoverProvider"
export const SetToolchainVersionNotification = "tolk.setToolchainVersion"

export interface TypeAtPositionParams {
    readonly textDocument: {
        readonly uri: string
    }
    readonly position: {
        readonly line: number
        readonly character: number
    }
}

export interface EnvironmentInfo {
    readonly nodeVersion?: string
    readonly platform: string
    readonly arch: string
}

export interface ToolchainInfo {
    readonly path: string
    readonly isAutoDetected: boolean
    readonly detectionMethod?: string
}

export interface SetToolchainVersionParams {
    readonly version: {
        readonly number: string
        readonly commit: string
    }
    readonly toolchain: ToolchainInfo
    readonly environment: EnvironmentInfo
}

export interface TypeAtPositionResponse {
    readonly type: string | null
    readonly range: lsp.Range | null
}
