//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

export function parseActonContractIds(content: string): string[] {
    const contractIds: string[] = []
    const contractRegex = /^\[contracts\.([^\s.\]]+)]/gm
    let match: RegExpExecArray | null

    while ((match = contractRegex.exec(content)) !== null) {
        const contractId = match[1]
        if (contractId) {
            contractIds.push(contractId)
        }
    }

    return contractIds
}

export function normalizeRetraceHash(value: string): string | null {
    const trimmed = value.trim()
    const normalized = trimmed.replace(/^0x/iu, "")

    return /^[a-f0-9]{64}$/iu.test(normalized) ? normalized : null
}
