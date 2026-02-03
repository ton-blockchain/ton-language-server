//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"

import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"
import {parentOfType} from "@server/psi/utils"

export class ContractFieldCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.contractTopLevel
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        const contract = parentOfType(ctx.element.node, "contract_declaration")
        if (!contract) return

        const body = contract.childForFieldName("body")
        if (!body) return

        const existingFields: Set<string> = new Set()
        for (const child of body.children) {
            if (child?.type === "contract_field") {
                const name = child.childForFieldName("name")?.text
                if (name) existingFields.add(name)
            }
        }

        const fields: Record<string, string> = {
            author: "Author of the contract",
            version: "Version of the contract",
            description: "Description of the contract",
            symbolsNamespace: "Namespace for contract symbols",
            incomingMessages: "Allowed incoming messages type",
            incomingExternal: "Allowed incoming external messages type",
            storage: "Persistent storage structure",
            storageAtDeployment: "Storage structure at deployment",
            forceAbiExport: "List of symbols to additionally export to ABI",
        }

        for (const [field, description] of Object.entries(fields)) {
            if (existingFields.has(field)) continue

            result.add({
                label: field,
                labelDetails: {
                    detail: `: ${description}`,
                },
                kind: CompletionItemKind.Field,
                insertText: `${field}: $0`,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.CONTEXT_ELEMENT,
            })
        }
    }
}
