import {ContractAbi} from "@shared/abi"

export interface Contract {
    readonly address: string
    readonly name: string
    readonly abi?: ContractAbi
}

export interface FormData {
    readonly sendContract?: string
    readonly getContract?: string
    readonly messageType?: "raw" | "structured"
    readonly selectedMessage?: string
    readonly messageFields?: Record<string, string>
    readonly value?: string
    readonly methodId?: string
    readonly selectedMethod?: string
    readonly storageFields?: Record<string, string>
}

export interface ResultData {
    readonly success: boolean
    readonly message: string
    readonly details?: string
}

export type Operation = "compile-deploy" | "send-message" | "get-method" | null

export interface VSCodeMessage {
    readonly type: string

    [key: string]: unknown
}

export interface VSCodeAPI {
    readonly postMessage: (message: VSCodeMessage) => void
    readonly getState: () => unknown
    readonly setState: (state: unknown) => void
}
