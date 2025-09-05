import {ContractAbi} from "@shared/abi"

export interface Contract {
    readonly address: string
    readonly name: string
    readonly abi?: ContractAbi
}

export interface ResultData {
    readonly success: boolean
    readonly message: string
    readonly details?: string
}

export type Operation = "compile-deploy" | "send-message" | "get-method" | "contract-info" | null

export interface VSCodeMessage {
    readonly type: string

    [key: string]: unknown
}

export interface VSCodeAPI {
    readonly postMessage: (message: VSCodeMessage) => void
    readonly getState: () => unknown
    readonly setState: (state: unknown) => void
}
