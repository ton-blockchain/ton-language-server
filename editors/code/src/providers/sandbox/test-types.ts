//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core

import {Cell, ContractABI as BadContractABI, loadTransaction} from "@ton/core"

import {TransactionInfo} from "../../common/types/transaction"
import {
    processRawTransactions,
    RawTransactionInfo,
    RawTransactions,
} from "../../common/types/raw-transaction"
import {HexString} from "../../common/hex-string"

export interface ContractMeta {
    readonly wrapperName?: string
    readonly abi?: BadContractABI | null
    readonly treasurySeed?: string
}

export interface ContractData {
    readonly address: string
    readonly stateInit?: HexString
    readonly account?: HexString
    readonly meta?: ContractMeta
}

export interface TestDataMessage {
    readonly $: "test-data"
    readonly testName: string
    readonly transactions: string
    readonly contracts: readonly ContractData[]
}

export interface TransactionRun {
    readonly id: string
    readonly name: string
    readonly timestamp: number
    readonly resultString: string
    readonly transactions: readonly TransactionInfo[]
    readonly contracts: readonly ContractData[]
}

function parseTransactions(data: string): RawTransactions | undefined {
    try {
        return JSON.parse(data) as RawTransactions
    } catch {
        return undefined
    }
}

export function processTxString(resultString: string): TransactionInfo[] {
    const rawTxs = parseTransactions(resultString)
    if (!rawTxs) {
        return []
    }

    const parsedTransactions = rawTxs.transactions.map(
        (it): RawTransactionInfo => ({
            ...it,
            transaction: it.transaction,
            parsedTransaction: loadTransaction(Cell.fromHex(it.transaction).asSlice()),
        }),
    )

    return processRawTransactions(parsedTransactions)
}
