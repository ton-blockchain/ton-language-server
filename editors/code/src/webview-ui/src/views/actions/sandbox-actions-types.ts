import {ContractAbi} from "@shared/abi"

import {DeployedContract} from "../../../../common/types/contract"
import {Base64String} from "../../../../common/base64-string"
import {HexString} from "../../../../common/hex-string"

import * as binary from "../../../../common/binary"
import {TransactionDetailsInfo} from "../../../../common/types/transaction"

export type ResultKeys =
  | "compile-deploy-result"
  | "send-internal-message-result"
  | "send-external-message-result"
  | "get-method-result"

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
  readonly result: ResultData | undefined
  readonly resultId: ResultKeys
}

export interface OpenOperationMessage {
  readonly type: "openOperation"
  readonly operation: Operation
  readonly contractAddress?: string
  readonly methodId?: number
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
  readonly account: HexString
  readonly stateInit?: {
    readonly code: Base64String
    readonly data: Base64String
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

export interface SandboxPersistedState {
  readonly contracts?: DeployedContract[]
  readonly currentOperation?: Operation
  readonly selectedContractAddress?: string
  readonly deployAbi?: ContractAbi
  readonly isConnected?: boolean
}

export interface RestoreStateMessage {
  readonly type: "restoreState"
  readonly state: SandboxPersistedState
}

export interface PersistStateMessage {
  readonly type: "persistState"
  readonly state: SandboxPersistedState
}

// Messages from Webview to Extension
export interface SendExternalMessageCommand {
  readonly type: "sendExternalMessage"
  readonly contractAddress: string
  readonly selectedMessage: string
  readonly messageBody: string
  readonly debug: boolean
}

export interface SendInternalMessageCommand {
  readonly type: "sendInternalMessage"
  readonly fromAddress: string
  readonly toAddress: string
  readonly selectedMessage: string
  readonly messageBody: string
  readonly sendMode: number
  readonly value: string
  readonly debug: boolean
}

export interface CallGetMethodCommand {
  readonly type: "callGetMethod"
  readonly contractAddress: string
  readonly selectedMethod: string
  readonly methodId: string
  readonly parameters: Base64String
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
  readonly stateData: Base64String
  readonly value: string
  readonly name: string
  readonly storageType?: string
}

export interface RedeployByNameCommand {
  readonly type: "redeployByName"
  readonly contractName: string
  readonly stateData: Base64String
  readonly value: string
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

export type ShowTransactionDetailsCommand = {
  readonly type: "showTransactionDetails"
} & TransactionDetailsInfo

export interface OpenContractSourceCommand {
  readonly type: "openContractSource"
  readonly sourceUri: string
}

export interface CreateMessageTemplateCommand {
  readonly type: "createMessageTemplate"
  readonly name: string
  readonly opcode: number
  readonly messageFields: binary.RawStringObject
  readonly sendMode: number
  readonly value: string
  readonly description?: string
}

export interface GetMessageTemplatesCommand {
  readonly type: "getMessageTemplates"
}

export interface DeleteMessageTemplateCommand {
  readonly type: "deleteMessageTemplate"
  readonly id: string
}

export interface SaveMessageAsTemplateCommand {
  readonly type: "saveMessageAsTemplate"
  readonly contractAddress: string
  readonly messageName: string
  readonly messageFields: binary.RawStringObject
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
  readonly messageFields: binary.RawStringObject
  readonly sendMode: number
  readonly value: string
  readonly createdAt: string
  readonly description?: string
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

export interface UpdateConnectionStatusMessage {
  readonly type: "updateConnectionStatus"
  readonly isConnected: boolean
}

export type VSCodeMessage =
  | UpdateContractsMessage
  | ShowResultMessage
  | OpenOperationMessage
  | UpdateContractAbiMessage
  | UpdateDeployStateMessage
  | UpdateContractInfoMessage
  | UpdateActiveEditorMessage
  | RestoreStateMessage
  | PersistStateMessage
  | MessageTemplatesMessage
  | TemplateCreatedMessage
  | TemplateUpdatedMessage
  | TemplateDeletedMessage
  | UpdateConnectionStatusMessage

export type VSCodeCommand =
  | SendExternalMessageCommand
  | SendInternalMessageCommand
  | CallGetMethodCommand
  | LoadAbiForDeployCommand
  | LoadContractInfoCommand
  | CompileAndDeployCommand
  | RedeployByNameCommand
  | RenameContractCommand
  | DeleteContractCommand
  | RefreshContractsCommand
  | WebviewReadyCommand
  | ShowTransactionDetailsCommand
  | OpenContractSourceCommand
  | CreateMessageTemplateCommand
  | GetMessageTemplatesCommand
  | DeleteMessageTemplateCommand
  | SaveMessageAsTemplateCommand

export interface VSCodeAPI {
  readonly postMessage: (command: VSCodeCommand) => void
  readonly getState: () => unknown
  readonly setState: (state: unknown) => void
}
