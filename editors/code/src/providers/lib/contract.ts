import {Address, ShardAccount, StateInit} from "@ton/core"
import {ContractAbi} from "@shared/abi"
import {SourceMap} from "ton-source-map"

export interface ContractData {
    readonly address: Address
    readonly stateInit: StateInit | undefined
    readonly account: ShardAccount
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
    readonly sourceUri?: string
    readonly sourceMap?: SourceMap
}
