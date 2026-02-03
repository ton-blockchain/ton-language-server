//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as lsp from "vscode-languageserver"

import {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"
import {ActonToml} from "@server/acton/ActonToml"

import {ActonStringArgumentCompletionProvider} from "./ActonStringArgumentCompletionProvider"

export class ActonContractIdCompletionProvider extends ActonStringArgumentCompletionProvider {
    protected shouldAddCompletions(
        functionName: string,
        qualifierName: string | undefined,
        argumentIndex: number,
    ): boolean {
        return functionName === "build" && qualifierName === undefined && argumentIndex === 0
    }

    protected addStringCompletions(ctx: CompletionContext, result: CompletionResult): void {
        const actonToml = ActonToml.discover(ctx.element.file.uri)
        if (!actonToml) return

        const contractIds = actonToml.getContractIds()
        for (const id of contractIds) {
            result.add({
                label: id,
                kind: lsp.CompletionItemKind.Class,
                weight: CompletionWeight.STRUCT,
            })
        }
    }
}
