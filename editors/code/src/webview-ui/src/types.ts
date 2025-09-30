import {ContractAbi} from "@shared/abi"
import {DeployedContract} from "../../providers/lib/contract"

export interface ResultData {
    readonly success: boolean
    readonly message: string
    readonly details?: string
}

export type Operation = "compile-deploy" | "send-message" | "get-method" | "contract-info" | null

// Messages from Extension to Webview
export interface UpdateContractsMessage {
    readonly type: "updateContracts"
    readonly contracts: DeployedContract[]
}

export interface ShowResultMessage {
    readonly type: "showResult"
    readonly result: ResultData
    readonly resultId?: string
}

export interface OpenOperationMessage {
    readonly type: "openOperation"
    readonly operation: Operation
    readonly contractAddress?: string
}

export interface UpdateContractAbiMessage {
    readonly type: "updateContractAbi"
    readonly abi: ContractAbi
}

export interface UpdateDeployStateMessage {
    readonly type: "updateDeployState"
    readonly state: {
        readonly isValidFile: boolean
        readonly hasRequiredFunctions: boolean
        readonly fileName?: string
        readonly errorMessage?: string
    }
    readonly abi?: ContractAbi
}

export interface ContractInfoData {
    readonly account: string
    readonly stateInit?: {
        readonly code: string
        readonly data: string
    }
    readonly abi?: ContractAbi
    readonly sourceUri?: string
}

export interface UpdateContractInfoMessage {
    readonly type: "updateContractInfo"
    readonly info: ContractInfoData
}

export interface UpdateActiveEditorMessage {
    readonly type: "updateActiveEditor"
    readonly document: {
        readonly uri: string
        readonly languageId: string
        readonly content: string
    } | null
}

// Messages from Webview to Extension
export interface SendExternalMessageCommand {
    readonly type: "sendExternalMessage"
    readonly contractAddress: string
    readonly selectedMessage: string
    readonly messageBody: string
    readonly autoDebug?: boolean
}

export interface SendInternalMessageCommand {
    readonly type: "sendInternalMessage"
    readonly fromAddress: string
    readonly toAddress: string
    readonly selectedMessage: string
    readonly messageBody: string
    readonly sendMode: number
    readonly value: string
    readonly autoDebug?: boolean
}

export interface CallGetMethodCommand {
    readonly type: "callGetMethod"
    readonly contractAddress: string
    readonly selectedMethod: string
    readonly methodId: string
}

export interface LoadAbiForDeployCommand {
    readonly type: "loadAbiForDeploy"
}

export interface LoadContractInfoCommand {
    readonly type: "loadContractInfo"
    readonly contractAddress: string
}

export interface CompileAndDeployCommand {
    readonly type: "compileAndDeploy"
    readonly stateInit: string
    readonly value?: string
    readonly name: string
    readonly storageType?: string
}

export interface RenameContractCommand {
    readonly type: "renameContract"
    readonly contractAddress: string
    readonly newName: string
}

export interface DeleteContractCommand {
    readonly type: "deleteContract"
    readonly contractAddress: string
}

export interface RefreshContractsCommand {
    readonly type: "refreshContracts"
}

export interface WebviewReadyCommand {
    readonly type: "webviewReady"
}

export interface ShowTransactionDetailsCommand {
    readonly type: "showTransactionDetails"
    readonly contractAddress: string
    readonly methodName: string
    readonly transactionId?: string
    readonly timestamp?: string
    readonly resultString?: string
    readonly account?: string // hex string for shardAccount
    readonly stateInit?: {
        readonly code: string // base64 string
        readonly data: string // base64 string
    }
    readonly abi?: object
}

export interface OpenContractSourceCommand {
    readonly type: "openContractSource"
    readonly sourceUri: string
}

export interface CreateMessageTemplateCommand {
    readonly type: "createMessageTemplate"
    readonly name: string
    readonly opcode: number
    readonly messageBody: string // Base64 encoded BoC
    readonly sendMode: number
    readonly value?: string
    readonly description?: string
}

export interface GetMessageTemplatesCommand {
    readonly type: "getMessageTemplates"
}

export interface UpdateMessageTemplateCommand {
    readonly type: "updateMessageTemplate"
    readonly id: string
    readonly name?: string
    readonly description?: string
}

export interface DeleteMessageTemplateCommand {
    readonly type: "deleteMessageTemplate"
    readonly id: string
}

export interface LoadMessageTemplateCommand {
    readonly type: "loadMessageTemplate"
    readonly id: string
}

export interface SaveMessageAsTemplateCommand {
    readonly type: "saveMessageAsTemplate"
    readonly contractAddress: string
    readonly messageName: string
    readonly messageBody: string // Base64 encoded BoC
    readonly sendMode: number
    readonly value: string
}

export interface MessageTemplatesMessage {
    readonly type: "messageTemplates"
    readonly templates: MessageTemplate[]
}

export interface MessageTemplate {
    readonly id: string
    readonly name: string
    readonly opcode: number
    readonly messageBody: string // Base64 encoded BoC
    readonly sendMode: number
    readonly value?: string
    readonly createdAt: string
    readonly description?: string
}

export interface MessageTemplateMessage {
    readonly type: "messageTemplate"
    readonly template: MessageTemplate
}

export interface TemplateCreatedMessage {
    readonly type: "templateCreated"
    readonly template: MessageTemplate
}

export interface TemplateUpdatedMessage {
    readonly type: "templateUpdated"
    readonly template: MessageTemplate
}

export interface TemplateDeletedMessage {
    readonly type: "templateDeleted"
    readonly templateId: string
}

export type VSCodeMessage =
    | UpdateContractsMessage
    | ShowResultMessage
    | OpenOperationMessage
    | UpdateContractAbiMessage
    | UpdateDeployStateMessage
    | UpdateContractInfoMessage
    | UpdateActiveEditorMessage
    | MessageTemplatesMessage
    | MessageTemplateMessage
    | TemplateCreatedMessage
    | TemplateUpdatedMessage
    | TemplateDeletedMessage

export type VSCodeCommand =
    | SendExternalMessageCommand
    | SendInternalMessageCommand
    | CallGetMethodCommand
    | LoadAbiForDeployCommand
    | LoadContractInfoCommand
    | CompileAndDeployCommand
    | RenameContractCommand
    | DeleteContractCommand
    | RefreshContractsCommand
    | WebviewReadyCommand
    | ShowTransactionDetailsCommand
    | OpenContractSourceCommand
    | CreateMessageTemplateCommand
    | GetMessageTemplatesCommand
    | UpdateMessageTemplateCommand
    | DeleteMessageTemplateCommand
    | LoadMessageTemplateCommand
    | SaveMessageAsTemplateCommand

export interface VSCodeAPI {
    readonly postMessage: (command: VSCodeCommand) => void
    readonly getState: () => unknown
    readonly setState: (state: unknown) => void
}
