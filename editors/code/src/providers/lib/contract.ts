import {Address, ShardAccount, StateInit} from "@ton/core"

export interface ContractData {
    readonly address: Address
    readonly stateInit: StateInit | undefined
    readonly account: ShardAccount
    readonly letter: string
    readonly displayName: string
    readonly kind: "treasury" | "user-contract"
}
