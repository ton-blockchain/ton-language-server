import vscode from "vscode"

import {SourceMap} from "ton-source-map"

import {Cell, parseTuple, serializeTuple, toNano, TupleItem, TupleReader} from "@ton/core"

import {GetContractAbiParams, GetContractAbiResponse} from "@shared/shared-msgtypes"

import {ContractAbi, TypeAbi} from "@shared/abi"

import {
    ContractInfoData,
    MessageTemplate,
    ResultData,
} from "../../webview-ui/src/views/actions/sandbox-actions-types"
import {Base64String} from "../../common/base64-string"

import {DeployedContract} from "../../common/types/contract"
import * as binary from "../../common/binary"
import {formatParsedObject, ParsedObject} from "../../common/binary"
import {HexString} from "../../common/hex-string"

import {TolkCompilerProvider} from "./TolkCompilerProvider"
import {SandboxTreeProvider} from "./SandboxTreeProvider"

export interface OperationNode {
    readonly id: string
    readonly type: "deploy" | "send-internal" | "send-external"
    readonly timestamp: string
    readonly contractName?: string
    readonly contractAddress?: string
    readonly success: boolean
    readonly details?: string
    readonly fromContract?: string
    readonly toContract?: string
    readonly resultString?: string
    readonly sendMode?: number
    readonly value?: string
    readonly messageBody?: string
}

export interface DeployState {
    readonly isValidFile: boolean
    readonly hasRequiredFunctions: boolean
    readonly fileName?: string
    readonly errorMessage?: string
}

export type DeployValidationResult = DeployState & {
    readonly abi?: ContractAbi
}

function checkRequiredFunctions(content: string): boolean {
    const hasOnInternalMessage = /fun\s+onInternalMessage\s*\(/.test(content)
    const hasMain = /fun\s+main\s*\(/.test(content)
    return hasOnInternalMessage || hasMain
}

export async function loadAndValidateAbiForDeploy(): Promise<ApiResponse<DeployValidationResult>> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        return {
            success: false,
            error: "No active editor found. Please open a Tolk contract file first.",
        }
    }

    const fileName = editor.document.fileName.split("/").pop() ?? "unknown"
    const languageId = editor.document.languageId

    if (languageId !== "tolk") {
        return {
            success: false,
            error: `Currently opened file is not a Tolk contract file (.tolk extension).`,
        }
    }

    const content = editor.document.getText()
    const hasRequiredFunctions = checkRequiredFunctions(content)

    if (!hasRequiredFunctions) {
        return {
            success: false,
            error: "File is missing required entry points. Please add either 'fun onInternalMessage()' or 'fun main()' or open another file.",
        }
    }

    try {
        const abiResult: GetContractAbiResponse = await vscode.commands.executeCommand(
            "tolk.getContractAbi",
            {
                textDocument: {
                    uri: editor.document.uri.toString(),
                },
            } satisfies GetContractAbiParams,
        )

        return {
            success: true,
            data: {
                isValidFile: true,
                hasRequiredFunctions: true,
                fileName,
                abi: abiResult.abi,
            },
        }
    } catch (error) {
        return {
            success: false,
            error: `Failed to extract contract ABI: ${error instanceof Error ? error.message : "Unknown compilation error"}`,
        }
    }
}

export async function loadContractInfo(address: string): Promise<ApiResponse<ContractInfoData>> {
    try {
        const config = vscode.workspace.getConfiguration("ton")
        const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

        const response = await fetch(`${sandboxUrl}/info`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                address,
            }),
        })

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`)
        }

        return (await response.json()) as ApiResponse<ContractInfoData>
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function compileAndDeployFromEditor(
    name: string,
    stateData: Base64String,
    treeProvider: SandboxTreeProvider | undefined,
    value: string,
    storageType?: string,
): Promise<ApiResponse<ResultData>> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        return {
            success: false,
            error: "No active editor with contract code",
        }
    }

    if (editor.document.languageId !== "tolk") {
        return {
            success: false,
            error: "Active file is not a Tolk contract",
        }
    }

    const sourceUri = editor.document.uri.toString()
    const abiResult: GetContractAbiResponse = await vscode.commands.executeCommand(
        "tolk.getContractAbi",
        {
            textDocument: {
                uri: sourceUri,
            },
        } satisfies GetContractAbiParams,
    )

    let contractAbi = abiResult.abi

    // If we have several storage types, we request actual one from the user
    // If so, we need to update the ABI with the actual storage type for all further operations
    if (storageType && contractAbi && !contractAbi.storage) {
        const storageTypeDef = contractAbi.types.find(type => type.name === storageType)
        if (storageTypeDef) {
            contractAbi = {
                ...contractAbi,
                storage: storageTypeDef,
            }
        }
    }

    try {
        const compiler = TolkCompilerProvider.getInstance()
        const result = await compiler.compileContract(editor.document.uri)

        if (!result.success) {
            return {
                success: false,
                error: `Compilation failed: ${result.error}`,
            }
        }

        if (!result.code) {
            return {
                success: false,
                error: "Compilation succeeded but no code generated",
            }
        }

        const deployResult = await deployContract(
            {
                code: result.code,
                data: stateData,
            },
            name,
            value,
            sourceUri,
            result.sourceMap,
            contractAbi,
        )

        if (deployResult.success) {
            const isRedeploy = treeProvider?.isContractDeployed(deployResult.data.address) ?? false

            treeProvider?.addDeployedContract(
                deployResult.data.address,
                name,
                contractAbi,
                result.sourceMap,
                sourceUri,
            )

            void vscode.commands.executeCommand("ton.sandbox.states.refresh")

            const message = isRedeploy
                ? `Contract redeployed successfully!`
                : `Contract deployed successfully!`

            return {
                success: true,
                data: {
                    success: true,
                    message,
                    details: deployResult.data.address,
                },
            }
        } else {
            return {
                success: false,
                error: `Deploy failed: ${deployResult.error}`,
            }
        }
    } catch (error) {
        return {
            success: false,
            error: `Operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        }
    }
}

async function deployContract(
    stateInit: {
        code: Base64String
        data: Base64String
    },
    name: string,
    value: string,
    sourceUri: string,
    sourceMap: SourceMap | undefined,
    abi: ContractAbi | undefined,
): Promise<ApiResponse<DeployContractData>> {
    try {
        const config = vscode.workspace.getConfiguration("ton")
        const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

        const response = await fetch(`${sandboxUrl}/deploy`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                stateInit,
                value: toNano(value).toString(),
                name,
                sourceMap,
                abi,
                sourceUri,
            }),
        })

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`)
        }

        return (await response.json()) as ApiResponse<DeployContractData>
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function loadLatestOperationResult(): Promise<
    ApiResponse<LoadLatestOperationResultData>
> {
    try {
        const config = vscode.workspace.getConfiguration("ton")
        const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

        const response = await fetch(`${sandboxUrl}/operations/latest/result`, {
            method: "GET",
            headers: {"Content-Type": "application/json"},
        })

        if (!response.ok) {
            if (response.status === 404) {
                return {
                    success: false,
                    error: "No operations found",
                }
            }
            throw new Error(`API call failed: ${response.status} ${response.statusText}`)
        }

        const data = (await response.json()) as {
            operation: OperationNode
        }

        return {
            success: true,
            data: {
                resultString: data.operation.resultString,
                operationData: data.operation,
            },
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

// Data types for API responses
export interface DeployContractData {
    readonly address: string
}

export interface SendMessageData {
    readonly txs: readonly {
        readonly addr: string
        readonly vmLogs: string
        readonly code: HexString
        readonly sourceMap?: SourceMap
    }[]
}

export interface CallGetMethodData {
    readonly result: TupleItem[]
    readonly logs?: string
}

export interface CreateMessageTemplateData {
    readonly template: MessageTemplate
}

export interface GetMessageTemplatesData {
    readonly templates: MessageTemplate[]
}

export interface GetContractsData {
    readonly contracts: DeployedContract[]
}

export interface GetOperationsData {
    readonly operations: OperationNode[]
}

export interface LoadLatestOperationResultData {
    readonly resultString?: string
    readonly operationData?: OperationNode
}

export type ApiResponse<T = object> = ApiResponseOk<T> | ApiResponseError

interface ApiResponseOk<T = object> {
    readonly success: true
    readonly data: T
}

interface ApiResponseError {
    readonly success: false
    readonly error: string
}

export async function sendExternalMessage(
    address: string,
    message: string,
): Promise<ApiResponse<SendMessageData>> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/send-external`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({address, message}),
    })

    if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as ApiResponse<SendMessageData>
}

export async function sendInternalMessage(
    fromAddress: string,
    toAddress: string,
    message: string,
    sendMode: number,
    value: string,
): Promise<ApiResponse<SendMessageData>> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/send-internal`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            fromAddress,
            toAddress,
            message,
            sendMode,
            value: toNano(value).toString(),
        }),
    })

    if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as ApiResponse<SendMessageData>
}

export interface CallGetMethodResponse {
    readonly success: boolean
    readonly result?: TupleItem[]
    readonly logs?: string
    readonly error?: string
}

export async function callGetMethod(
    address: string,
    methodId: number,
    parametersBase64: string,
): Promise<ApiResponse<CallGetMethodData>> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/get`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({address, parameters: parametersBase64, methodId}),
    })

    if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`)
    }

    const apiResult = (await response.json()) as ApiResponse<{
        result?: string
        logs?: string
    }>

    if (apiResult.success) {
        return {
            success: true,
            data: {
                result: apiResult.data.result
                    ? parseTuple(Cell.fromBase64(apiResult.data.result))
                    : [],
                logs: apiResult.data.logs,
            },
        }
    }

    return apiResult
}

export function parseGetMethodResult(
    contractAbi: ContractAbi | undefined,
    reader: TupleReader,
    methodId: number,
): ParsedObject {
    if (!contractAbi) {
        const rawValue = JSON.stringify(reader, (_, value: unknown) =>
            typeof value === "bigint" ? value.toString() : value,
        )
        throw new Error(`Raw result: ${rawValue}\n\nNote: Contract ABI not available`)
    }

    const getMethod = contractAbi.getMethods.find(method => method.id === methodId)

    if (!getMethod?.returnType) {
        const rawValue = JSON.stringify(reader, (_, value: unknown) =>
            typeof value === "bigint" ? value.toString() : value,
        )
        throw new Error(`Raw result: ${rawValue}\n\nNote: Return type ABI is not available`)
    }

    try {
        const structTypeAbi =
            getMethod.returnType.name === "struct"
                ? contractAbi.types.find(type => type.name === getMethod.returnType?.humanReadable)
                : undefined
        const typeAbi: TypeAbi = structTypeAbi ?? {
            name: "getMethodResult",
            opcode: undefined,
            opcodeWidth: undefined,
            fields: [
                {
                    name: "value",
                    type: getMethod.returnType,
                },
            ],
        }
        return binary.parseTuple(contractAbi, typeAbi, reader)
    } catch (parseError) {
        const rawValue = JSON.stringify(reader, (_, value: unknown) =>
            typeof value === "bigint" ? value.toString() : value,
        )
        throw new Error(
            `Raw result: ${rawValue}\n\nParsing error: ${parseError instanceof Error ? parseError.message : "Unknown parsing error"}`,
        )
    }
}

export interface MessageTemplateData {
    readonly name: string
    readonly opcode: number
    readonly messageFields: binary.RawStringObject
    readonly sendMode: number
    readonly value: string
    readonly description?: string
}

export async function createMessageTemplate(
    templateData: MessageTemplateData,
): Promise<ApiResponse<CreateMessageTemplateData>> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/message-templates`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(templateData),
    })

    if (!response.ok) {
        return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
        }
    }

    const template = (await response.json()) as ApiResponse<MessageTemplate>
    if (!template.success) {
        return template
    }

    return {
        success: true,
        data: {
            template: template.data,
        },
    }
}

export async function getMessageTemplates(): Promise<ApiResponse<GetMessageTemplatesData>> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/message-templates`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    })

    if (!response.ok) {
        return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
        }
    }

    return (await response.json()) as ApiResponse<GetMessageTemplatesData>
}

export async function deleteMessageTemplate(id: string): Promise<ApiResponse> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/message-templates/${id}`, {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json",
        },
    })

    if (!response.ok) {
        return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
        }
    }

    return {
        success: true,
        data: {},
    }
}

export async function renameContract(address: string, newName: string): Promise<ApiResponse> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/rename-contract`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({address, newName}),
    })

    if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as ApiResponse
}

export async function getContracts(): Promise<ApiResponse<GetContractsData>> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/contracts`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    })

    if (!response.ok) {
        return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
        }
    }

    return (await response.json()) as ApiResponse<GetContractsData>
}

export async function deleteContract(address: string): Promise<ApiResponse> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/contracts/${address}`, {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json",
        },
    })

    if (!response.ok) {
        return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
        }
    }

    return {
        success: true,
        data: {},
    }
}

export async function callGetMethodDirectly(
    contract: DeployedContract,
    methodId: number,
): Promise<void> {
    const getMethod = contract.abi?.getMethods.find(method => method.id === methodId)
    if (getMethod?.parameters?.length !== 0) {
        // For get methods with parameters open sidebar with filled contract and method id
        void vscode.commands.executeCommand(
            "ton.sandbox.openContractGetMethodSend",
            contract.address,
            methodId,
        )
        return
    }

    try {
        const emptyParameters = serializeTuple([]).toBoc().toString("base64")
        const result = await callGetMethod(contract.address, methodId, emptyParameters)

        if (result.success) {
            const reader = new TupleReader(result.data.result)
            try {
                const parsedResult = parseGetMethodResult(contract.abi, reader, methodId)
                const formattedResult = formatParsedObject(parsedResult)

                void vscode.window.showInformationMessage(formattedResult)
            } catch (error) {
                void vscode.window.showErrorMessage(
                    `Failed to parse result: ${error instanceof Error ? error.message : "Unknown error"}`,
                )
            }
        } else {
            void vscode.window.showErrorMessage(`Call failed: ${result.error}`)
        }
    } catch (error) {
        void vscode.window.showErrorMessage(
            `Call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
    }
}

export async function getOperations(): Promise<ApiResponse<GetOperationsData>> {
    try {
        const config = vscode.workspace.getConfiguration("ton")
        const serverUrl = config.get<string>("sandboxServerUrl") ?? "http://localhost:3000"

        const response = await fetch(`${serverUrl}/operations`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        })

        if (!response.ok) {
            return {
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}`,
            }
        }

        const data = (await response.json()) as {
            operations: OperationNode[]
        }
        return {
            success: true,
            data: {
                operations: data.operations,
            },
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function restoreBlockchainState(eventId: string): Promise<ApiResponse> {
    try {
        const config = vscode.workspace.getConfiguration("ton")
        const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

        const response = await fetch(`${sandboxUrl}/restore-state`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({eventId}),
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        return {
            success: true,
            data: {},
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function checkSandboxStatus(): Promise<{
    success: boolean
    error?: string
}> {
    try {
        const config = vscode.workspace.getConfiguration("ton")
        const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

        const response = await fetch(`${sandboxUrl}/health`, {
            method: "GET",
            signal: AbortSignal.timeout(5000),
        })

        return {
            success: response.ok,
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export interface OperationTrace {
    readonly operations: readonly OperationTraceItem[]
    readonly timestamp: string
    readonly version: string
}

export type OperationTraceItem =
    | {readonly type: "deploy"; readonly data: DeployRequest}
    | {readonly type: "send-external"; readonly data: SendExternalMessageRequest}
    | {readonly type: "send-internal"; readonly data: SendInternalMessageRequest}
    | {readonly type: "rename-contract"; readonly data: RenameContractRequest}

export interface DeployRequest {
    readonly stateInit: {
        readonly code: Base64String
        readonly data: Base64String
    }
    readonly value: string
    readonly name: string
    readonly sourceMap?: object
    readonly abi?: object
    readonly sourceUri: string
}

export interface SendExternalMessageRequest {
    readonly address: string
    readonly message: Base64String
}

export interface SendInternalMessageRequest {
    readonly fromAddress: string
    readonly toAddress: string
    readonly message: Base64String
    readonly sendMode: number
    readonly value: string
}

export interface RenameContractRequest {
    readonly address: string
    readonly newName: string
}

export async function exportTrace(): Promise<ApiResponse<OperationTrace>> {
    try {
        const config = vscode.workspace.getConfiguration("ton")
        const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

        const response = await fetch(`${sandboxUrl}/export-trace`, {
            method: "GET",
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        return (await response.json()) as ApiResponse<OperationTrace>
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function importTrace(trace: OperationTrace): Promise<ApiResponse> {
    try {
        const config = vscode.workspace.getConfiguration("ton")
        const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

        const response = await fetch(`${sandboxUrl}/import-trace`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({trace}),
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        return (await response.json()) as ApiResponse
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}
