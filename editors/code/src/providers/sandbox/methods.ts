import vscode from "vscode"

import {SourceMap} from "ton-source-map"

import {Cell, parseTuple, serializeTuple, TupleItem, TupleReader} from "@ton/core"

import {GetContractAbiParams, GetContractAbiResponse} from "@shared/shared-msgtypes"

import {ContractAbi, TypeAbi} from "@shared/abi"

import {
    ContractInfoData,
    MessageTemplate,
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

export async function loadAndValidateAbiForDeploy(): Promise<DeployValidationResult> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        return {
            isValidFile: false,
            hasRequiredFunctions: false,
            errorMessage: "No active editor found. Please open a Tolk contract file first.",
        }
    }

    const fileName = editor.document.fileName.split("/").pop() ?? "unknown"
    const languageId = editor.document.languageId

    if (languageId !== "tolk") {
        return {
            isValidFile: false,
            hasRequiredFunctions: false,
            fileName,
            errorMessage: `Currently opened file is not a Tolk contract file (.tolk extension).`,
        }
    }

    const content = editor.document.getText()
    const hasRequiredFunctions = checkRequiredFunctions(content)

    if (!hasRequiredFunctions) {
        return {
            isValidFile: true,
            hasRequiredFunctions: false,
            fileName,
            errorMessage:
                "File is missing required entry points. Please add either 'fun onInternalMessage()' or 'fun main()' or open another file.",
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
            isValidFile: true,
            hasRequiredFunctions: true,
            fileName,
            abi: abiResult.abi,
        }
    } catch (error) {
        return {
            isValidFile: true,
            hasRequiredFunctions: true,
            fileName,
            errorMessage: `Failed to extract contract ABI: ${error instanceof Error ? error.message : "Unknown compilation error"}`,
        }
    }
}

export async function loadContractInfo(address: string): Promise<{
    success: boolean
    result?: ContractInfoData
    error?: string
}> {
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

        return (await response.json()) as {
            success: boolean
            result?: ContractInfoData
            error?: string
        }
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
): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        void vscode.window.showErrorMessage("No active editor with contract code")
        return
    }

    if (editor.document.languageId !== "tolk") {
        void vscode.window.showErrorMessage("Active file is not a Tolk contract")
        return
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
            void vscode.window.showErrorMessage(`Compilation failed: ${result.error}`)
            return
        }

        if (!result.code) {
            void vscode.window.showErrorMessage("Compilation succeeded but no code generated")
            return
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
        if (deployResult.success && deployResult.address) {
            const isRedeploy = treeProvider?.isContractDeployed(deployResult.address) ?? false

            treeProvider?.addDeployedContract(
                deployResult.address,
                name,
                contractAbi,
                sourceUri,
                result.sourceMap,
            )

            void vscode.commands.executeCommand("ton.sandbox.states.refresh")

            const message = isRedeploy
                ? `Contract redeployed successfully! Address: ${formatAddress(deployResult.address)}`
                : `Contract deployed successfully! Address: ${formatAddress(deployResult.address)}`

            void vscode.window.showInformationMessage(message)
        } else {
            void vscode.window.showErrorMessage(`Deploy failed: ${deployResult.error}`)
        }
    } catch (error) {
        void vscode.window.showErrorMessage(
            `Operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
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
): Promise<{
    success: boolean
    address?: string
    error?: string
}> {
    try {
        const config = vscode.workspace.getConfiguration("ton")
        const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

        const response = await fetch(`${sandboxUrl}/deploy`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                stateInit,
                value,
                name,
                sourceMap,
                abi,
                sourceUri,
            }),
        })

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`)
        }

        return (await response.json()) as {success: boolean; address?: string; error?: string}
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function loadLatestOperationResult(): Promise<{
    success: boolean
    resultString?: string
    operationData?: OperationNode
    error?: string
}> {
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
            resultString: data.operation.resultString,
            operationData: data.operation,
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

interface ApiResponse<T = void> {
    readonly success: boolean
    readonly error?: string
    readonly data?: T
}

interface SendMessageResponse {
    readonly success: boolean
    readonly error?: string
    readonly txs: readonly {
        readonly addr: string
        readonly vmLogs: string
        readonly code: HexString
        readonly sourceMap?: SourceMap
    }[]
}

export async function sendExternalMessage(
    address: string,
    message: string,
): Promise<SendMessageResponse> {
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

    return (await response.json()) as SendMessageResponse
}

export async function sendInternalMessage(
    fromAddress: string,
    toAddress: string,
    message: string,
    sendMode: number,
    value: string,
): Promise<SendMessageResponse> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/send-internal`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({fromAddress, toAddress, message, sendMode, value}),
    })

    if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as SendMessageResponse
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
): Promise<CallGetMethodResponse> {
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

    const result = (await response.json()) as {
        success: boolean
        result?: string
        logs?: string
        error?: string
    }
    return {
        ...result,
        result: result.result ? parseTuple(Cell.fromBase64(result.result)) : undefined,
    }
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
    readonly messageBody: string
    readonly sendMode: number
    readonly value: string
    readonly description?: string
}

export async function createMessageTemplate(templateData: MessageTemplateData): Promise<{
    success: boolean
    template?: MessageTemplate
    error?: string
}> {
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

    const template = (await response.json()) as MessageTemplate
    return {
        success: true,
        template,
    }
}

export async function getMessageTemplates(): Promise<{
    success: boolean
    templates?: MessageTemplate[]
    error?: string
}> {
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

    const data = (await response.json()) as {templates: MessageTemplate[]}
    return {
        success: true,
        templates: data.templates,
    }
}

export async function getMessageTemplate(id: string): Promise<{
    success: boolean
    template?: MessageTemplate
    error?: string
}> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/message-templates/${id}`, {
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

    const template = (await response.json()) as MessageTemplate
    return {
        success: true,
        template,
    }
}

export async function updateMessageTemplate(
    id: string,
    updates: {
        name?: string
        description?: string
    },
): Promise<{
    success: boolean
    error?: string
}> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/message-templates/${id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
    })

    if (!response.ok) {
        return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
        }
    }

    return {
        success: true,
    }
}

export async function deleteMessageTemplate(id: string): Promise<{
    success: boolean
    error?: string
}> {
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
    }
}

export async function renameContract(
    address: string,
    newName: string,
): Promise<{
    success: boolean
    error?: string
}> {
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

    return (await response.json()) as {
        success: boolean
        error?: string
    }
}

export async function getContracts(): Promise<{
    success: boolean
    contracts?: DeployedContract[]
    error?: string
}> {
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

    const data = (await response.json()) as {
        contracts: DeployedContract[]
    }
    return {
        success: true,
        contracts: data.contracts,
    }
}

export async function deleteContract(address: string): Promise<{
    success: boolean
    error?: string
}> {
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
    }
}

export async function callGetMethodDirectly(
    contract: DeployedContract,
    methodId: number,
): Promise<void> {
    try {
        const emptyParameters = serializeTuple([]).toBoc().toString("base64")
        const result = await callGetMethod(contract.address, methodId, emptyParameters)

        if (result.success) {
            const reader = new TupleReader(result.result ?? [])
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
            void vscode.window.showErrorMessage(`Call failed: ${result.error ?? "Unknown error"}`)
        }
    } catch (error) {
        void vscode.window.showErrorMessage(
            `Call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
    }
}

export async function getOperations(): Promise<{
    success: boolean
    operations?: OperationNode[]
    error?: string
}> {
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
            operations: data.operations,
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
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export function formatAddress(address: string): string {
    if (address.length <= 12) {
        return address
    }
    return `${address.slice(0, 6)}...${address.slice(Math.max(0, address.length - 6))}`
}
