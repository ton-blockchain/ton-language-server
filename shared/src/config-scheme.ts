//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio

// package.json, configuration properties keys
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TonPluginConfigScheme {}

// package.json, configuration properties default values
export const defaultConfig: TonPluginConfigScheme = {}

export interface ClientOptions {
    readonly treeSitterWasmUri: string
    readonly tolkLangWasmUri: string
    readonly funcLangWasmUri: string
    readonly fiftLangWasmUri: string
    readonly tlbLangWasmUri: string
}
