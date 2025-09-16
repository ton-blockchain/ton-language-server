import {OperationNode} from "./components/StatesView"

export interface UpdateOperationsMessage {
    readonly type: "updateOperations"
    readonly operations: OperationNode[]
    readonly isLoading?: boolean
}

export type StatesMessage = UpdateOperationsMessage

export interface LoadOperationsCommand {
    readonly type: "loadOperations"
}

export interface WebviewReadyCommand {
    readonly type: "webviewReady"
}

export interface RestoreStateCommand {
    readonly type: "restoreState"
    readonly eventId: string
}

export interface ShowTransactionDetailsCommand {
    readonly type: "showTransactionDetails"
    readonly contractAddress: string
    readonly methodName: string
    readonly transactionId?: string
    readonly timestamp: string
    readonly resultString?: string
}

export interface DebugTransactionCommand {
    readonly type: "debugTransaction"
    readonly operationId: string
}

export type StatesCommand =
    | LoadOperationsCommand
    | WebviewReadyCommand
    | RestoreStateCommand
    | ShowTransactionDetailsCommand
    | DebugTransactionCommand

export interface StatesVSCodeAPI {
    readonly postMessage: (command: StatesCommand) => void
    readonly getState: () => unknown
    readonly setState: (state: unknown) => void
}
