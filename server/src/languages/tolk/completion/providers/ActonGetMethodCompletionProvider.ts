//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as path from "node:path"

import * as lsp from "vscode-languageserver"

import {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"
import {index, IndexKey} from "@server/languages/tolk/indexes"
import {GetMethod} from "@server/languages/tolk/psi/Decls"
import {ResolveState} from "@server/psi/ResolveState"

import {ActonStringArgumentCompletionProvider} from "./ActonStringArgumentCompletionProvider"

export class ActonGetMethodCompletionProvider extends ActonStringArgumentCompletionProvider {
    protected shouldAddCompletions(
        functionName: string,
        qualifierName: string | undefined,
        argumentIndex: number,
    ): boolean {
        return functionName === "runGetMethod" && qualifierName === "net" && argumentIndex === 1
    }

    protected async addStringCompletions(
        _ctx: CompletionContext,
        result: CompletionResult,
    ): Promise<void> {
        await Promise.resolve()
        const getMethods: GetMethod[] = []
        index.processElementsByKey(
            IndexKey.GetMethods,
            {
                execute: node => {
                    if (node.file.fromActon) {
                        return true
                    }
                    if (node instanceof GetMethod && !node.isTestFunction()) {
                        getMethods.push(node)
                    }
                    return true
                },
            },
            new ResolveState(),
        )

        for (const method of getMethods) {
            const name = method.name()
            if (!name) continue
            result.add({
                label: name,
                kind: lsp.CompletionItemKind.Method,
                labelDetails: {
                    detail: ` ${path.basename(method.file.uri)}`,
                },
                weight: CompletionWeight.FUNCTION,
            })
        }
    }
}
