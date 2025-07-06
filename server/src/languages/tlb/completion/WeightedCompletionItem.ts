//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {CompletionItem} from "vscode-languageserver-types"

export enum CompletionWeight {
    CONTEXT_ELEMENT = 0,
    KEYWORD = 80,
    LOWEST = 500,
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

        sorted.forEach(item => {
            const weight = item.weight as number
            if (lastWeight !== weight) {
                groupIndex++
                lastWeight = weight
            }

            item.sortText = groupIndex.toString()
        })

        return sorted
    }
}
