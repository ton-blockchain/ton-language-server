//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core

import {ContractABI as BadContractABI} from "@ton/core"

import {TransactionInfo} from "../../common/types/transaction"
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
