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

export type StatesCommand = LoadOperationsCommand | WebviewReadyCommand | RestoreStateCommand

export interface StatesVSCodeAPI {
    readonly postMessage: (command: StatesCommand) => void
    readonly getState: () => unknown
    readonly setState: (state: unknown) => void
}
