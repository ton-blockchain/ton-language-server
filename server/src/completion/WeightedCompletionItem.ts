//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {CompletionItem} from "vscode-languageserver-types"

export enum CompletionWeight {
    CONTEXT_ELEMENT = 0,
    VARIABLE = 50,
    PARAM = 60,
    FIELD = 70,
    KEYWORD = 80,
    FUNCTION = 90,
    SNIPPET = 95,
    CONSTANT = 100,
    GLOBAL_VARIABLE = 105,
    STRUCT = 110,
    ENUM = 115,
    TYPE_ALIAS = 120,
    LOWEST = 500,
}

export function contextWeight(weight: CompletionWeight, match: boolean): CompletionWeight {
    if (match) return weight
    return weight + 500
}

// eslint-disable-next-line functional/type-declaration-immutability
export type WeightedCompletionItem = CompletionItem & {
    readonly weight?: CompletionWeight
}

export class CompletionResult {
    public elements: WeightedCompletionItem[] = []

    public add(...element: WeightedCompletionItem[]): void {
        this.elements.push(...element)
    }

    public sorted(): CompletionItem[] {
        if (this.elements.length === 0) return []

        const sorted = this.elements.sort((a, b) => {
            if (a.weight === undefined || b.weight === undefined) return 0
            return a.weight - b.weight
        })

        let groupIndex = 0
        let lastWeight = sorted[0].weight ?? 0

        for (const item of sorted) {
            const weight = item.weight as number
            if (lastWeight !== weight) {
                groupIndex++
                lastWeight = weight
            }

            item.sortText = groupIndex.toString()
        }

        return sorted
    }
}
