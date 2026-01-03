//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as lsp from "vscode-languageserver"

import {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"
import {ActonToml} from "@server/acton/ActonToml"

import {ActonStringArgumentCompletionProvider} from "./ActonStringArgumentCompletionProvider"

export class ActonWalletNameCompletionProvider extends ActonStringArgumentCompletionProvider {
    protected shouldAddCompletions(
        functionName: string,
        qualifierName: string | undefined,
        argumentIndex: number,
    ): boolean {
        return functionName === "wallet" && qualifierName === "net" && argumentIndex === 0
    }

    protected async addStringCompletions(
        ctx: CompletionContext,
        result: CompletionResult,
    ): Promise<void> {
        const actonToml = await ActonToml.find(ctx.element.file.uri)
        if (!actonToml) return

        const wallets = await actonToml.getWallets()
        for (const wallet of wallets) {
            result.add({
                label: wallet.name,
                kind: lsp.CompletionItemKind.Value,
                labelDetails: {
                    detail: wallet.isLocal ? " (local)" : " (global)",
                },
                weight: CompletionWeight.VARIABLE,
            })
        }
    }
}
