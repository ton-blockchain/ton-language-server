import {Address} from "@ton/core"

import {SourceMap} from "ton-source-map"

import {ContractAbi} from "@shared/abi"

export interface ContractData {
    readonly address: Address
    readonly letter: string
    readonly displayName: string
    readonly kind: "treasury" | "user-contract"
    readonly abi?: ContractAbi
}

// eslint-disable-next-line functional/type-declaration-immutability
export interface DeployedContract {
    name: string
    readonly address: string
    readonly deployTime?: Date
    readonly abi?: ContractAbi
    readonly sourceUri: string
    readonly sourceMap?: SourceMap
}
