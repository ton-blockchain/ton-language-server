//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import {SandboxTreeProvider} from "../providers/SandboxTreeProvider"
import {SandboxFormProvider} from "../providers/SandboxFormProvider"
import {StatesWebviewProvider} from "../providers/StatesWebviewProvider"
import {beginCell, Cell} from "@ton/core"
import {Message} from "@shared/abi"
import {TolkSourceMap} from "../providers/TolkCompilerProvider"
import {MessageTemplate} from "../webview-ui/src/types"
import {DeployedContract} from "../providers/lib/contract"

export function registerSandboxCommands(
    treeProvider: SandboxTreeProvider,
    formProvider: SandboxFormProvider,
    statesProvider: StatesWebviewProvider,
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = []

    disposables.push(
        vscode.commands.registerCommand("ton.sandbox.refresh", () => {
            treeProvider.refresh()
        }),
        vscode.commands.registerCommand("ton.sandbox.clearContracts", () => {
            treeProvider.clearContracts()
            void vscode.window.showInformationMessage("Deployed contracts cleared")
        }),
        vscode.commands.registerCommand("ton.sandbox.openOperation", (operation: string) => {
            formProvider.openOperation(operation)
        }),
        vscode.commands.registerCommand(
            "ton.sandbox.openContractInfo",
            (contractAddress: string) => {
                formProvider.openOperation("contract-info", contractAddress)
            },
        ),
        vscode.commands.registerCommand("ton.sandbox.deployFromCodeLens", () => {
            formProvider.openOperation("compile-deploy")
        }),
        vscode.commands.registerCommand(
            "ton.sandbox.copyContractAddress",
            async (address: string) => {
                await vscode.env.clipboard.writeText(address)
                void vscode.window.showInformationMessage(`Contract address copied: ${address}`)
            },
        ),
        vscode.commands.registerCommand(
            "ton.sandbox.openContractSendMessage",
            (address: string) => {
                formProvider.openOperation("send-message", address)
            },
        ),
        vscode.commands.registerCommand(
            "ton.sandbox.callGetMethodFromCodeLens",
            async (address: string, methodName: string, methodId: number) => {
                await callGetMethodDirectly(address, methodName, methodId)
            },
        ),
        vscode.commands.registerCommand("ton.sandbox.states.refresh", () => {
            void statesProvider.handleLoadOperations()
        }),
        vscode.commands.registerCommand("ton.sandbox.debugTransaction", (operationId: string) => {
            statesProvider.handleDebugTransaction(operationId)
        }),
        vscode.commands.registerCommand(
            "ton.sandbox.startDebugSequence",
            (transactions: import("../providers/SandboxFormProvider").TransactionInfo[]) => {
                formProvider.startSequentialDebugging(transactions)
            },
        ),
    )

    return disposables
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
        readonly code: string
        readonly sourceMap?: TolkSourceMap
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
    value?: string,
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

export async function callGetMethod(
    address: string,
    methodId: number,
): Promise<{
    success: boolean
    result?: string
    logs?: string
    error?: string
}> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/get`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({address, methodId}),
    })

    if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as {
        success: boolean
        result?: string
        logs?: string
        error?: string
    }
}

export async function createMessageTemplate(templateData: {
    name: string
    opcode: number
    messageFields: Record<string, string>
    sendMode: number
    value?: string
    description?: string
}): Promise<{
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

export function buildStructuredMessage(
    messageName: string,
    messageFields: Record<string, string>,
    formProvider: SandboxFormProvider,
    contractAddress?: string,
): string {
    const builder = beginCell()

    let messageAbi: Message | null = null
    if (contractAddress) {
        try {
            messageAbi = getMessageAbiFromFormProvider(formProvider, contractAddress, messageName)
        } catch {}
    }

    const opcode = messageAbi?.opcode ?? 0
    const opcodeWidth = messageAbi?.opcodeWidth ?? 32
    builder.storeUint(opcode, opcodeWidth)

    for (const [fieldName, fieldValue] of Object.entries(messageFields)) {
        if (!fieldValue.trim()) {
            continue
        }

        const fieldAbi = messageAbi?.fields.find(f => f.name === fieldName)
        const fieldType = fieldAbi?.type ?? fieldName

        const fieldTypeInfo = parseFieldTypeFromAbi(fieldType, fieldName, fieldValue)

        try {
            switch (fieldTypeInfo.type) {
                case "uint": {
                    const value = BigInt(fieldValue)
                    builder.storeUint(value, fieldTypeInfo.bits)
                    break
                }
                case "int": {
                    const value = BigInt(fieldValue)
                    builder.storeInt(value, fieldTypeInfo.bits)
                    break
                }
                case "bool": {
                    const value = fieldValue.toLowerCase() === "true" || fieldValue === "1"
                    builder.storeBit(value)
                    break
                }
                case "varuint": {
                    const value = BigInt(fieldValue)
                    builder.storeVarUint(value, fieldTypeInfo.maxBytes)
                    break
                }
                case "varint": {
                    const value = BigInt(fieldValue)
                    builder.storeVarInt(value, fieldTypeInfo.maxBytes)
                    break
                }
                case "cell": {
                    const cellValue = Cell.fromBase64(fieldValue)
                    builder.storeRef(cellValue)
                    break
                }
                default: {
                    const value = BigInt(fieldValue)
                    builder.storeUint(value, 256)
                    break
                }
            }
        } catch (error) {
            throw new Error(
                `Failed to encode field ${fieldName} (${fieldType}) with value ${fieldValue}: ${error instanceof Error ? error.message : "Unknown error"}`,
            )
        }
    }

    const cell = builder.endCell()
    return cell.toBoc().toString("base64")
}

function getMessageAbiFromFormProvider(
    formProvider: SandboxFormProvider,
    contractAddress: string,
    messageName: string,
): Message | null {
    const contracts = formProvider.deployedContracts

    const contract = contracts.find(c => c.address === contractAddress)
    if (!contract || !contract.abi || contract.abi.messages.length === 0) {
        return null
    }

    const message = contract.abi.messages.find(m => m.name === messageName)
    return message ?? null
}

interface FieldTypeInfo {
    readonly type: string
    readonly bits: number
    readonly maxBytes: number
}

function parseFieldType(fieldName: string, fieldValue: string): FieldTypeInfo {
    const lowerName = fieldName.toLowerCase()
    const lowerValue = fieldValue.toLowerCase()

    if (lowerName.includes("bool") || lowerName.includes("flag")) {
        return {type: "bool", bits: 1, maxBytes: 1}
    }

    const varuintMatch = /varuint(\d+)?/.exec(lowerName)
    if (varuintMatch) {
        const maxBytes = varuintMatch[1] ? Math.ceil(Number.parseInt(varuintMatch[1], 10) / 8) : 16
        return {type: "varuint", bits: 0, maxBytes}
    }

    const varintMatch = /varint(\d+)?/.exec(lowerName)
    if (varintMatch) {
        const maxBytes = varintMatch[1] ? Math.ceil(Number.parseInt(varintMatch[1], 10) / 8) : 16
        return {type: "varint", bits: 0, maxBytes}
    }

    const uintMatch = /uint(\d+)?/.exec(lowerName)
    if (uintMatch) {
        const bits = uintMatch[1] ? Number.parseInt(uintMatch[1], 10) : 256
        return {type: "uint", bits, maxBytes: 0}
    }

    const intMatch = /int(\d+)?/.exec(lowerName)
    if (intMatch && !lowerName.includes("uint")) {
        const bits = intMatch[1] ? Number.parseInt(intMatch[1], 10) : 257
        return {type: "int", bits, maxBytes: 0}
    }

    if (lowerName.includes("cell") || lowerName.includes("ref")) {
        return {type: "cell", bits: 0, maxBytes: 0}
    }

    if (lowerValue === "true" || lowerValue === "false") {
        return {type: "bool", bits: 1, maxBytes: 1}
    }

    if (fieldValue.length > 20 && /^[\d+/A-Za-z]*={0,2}$/.test(fieldValue)) {
        try {
            Cell.fromBase64(fieldValue)
            return {type: "cell", bits: 0, maxBytes: 0}
        } catch {}
    }

    return {type: "uint", bits: 256, maxBytes: 0}
}

function parseFieldTypeFromAbi(
    abiType: string,
    fieldName: string,
    fieldValue: string,
): FieldTypeInfo {
    const lowerAbiType = abiType.toLowerCase()

    if (lowerAbiType === "bool") {
        return {type: "bool", bits: 1, maxBytes: 1}
    }

    const uintMatch = /^uint(\d+)$/.exec(lowerAbiType)
    if (uintMatch) {
        const bits = Number.parseInt(uintMatch[1], 10)
        return {type: "uint", bits, maxBytes: 0}
    }

    const intMatch = /^int(\d+)$/.exec(lowerAbiType)
    if (intMatch) {
        const bits = Number.parseInt(intMatch[1], 10)
        return {type: "int", bits, maxBytes: 0}
    }

    const varuintMatch = /^varuint(\d+)$/.exec(lowerAbiType)
    if (varuintMatch) {
        const maxBits = Number.parseInt(varuintMatch[1], 10)
        const maxBytes = Math.ceil(maxBits / 8)
        return {type: "varuint", bits: 0, maxBytes}
    }

    const varintMatch = /^varint(\d+)$/.exec(lowerAbiType)
    if (varintMatch) {
        const maxBits = Number.parseInt(varintMatch[1], 10)
        const maxBytes = Math.ceil(maxBits / 8)
        return {type: "varint", bits: 0, maxBytes}
    }

    if (lowerAbiType === "cell") {
        return {type: "cell", bits: 0, maxBytes: 0}
    }

    return parseFieldType(fieldName, fieldValue)
}

export async function callGetMethodDirectly(
    address: string,
    methodName: string,
    methodId: number,
): Promise<void> {
    try {
        const result = await callGetMethod(address, methodId)

        if (result.success) {
            const message = result.result ?? "null"
            const details = result.logs ? `Logs:\n${result.logs}` : ""

            void vscode.window.showInformationMessage(message, {detail: details})
        } else {
            void vscode.window.showErrorMessage(
                `❌ Call failed: ${result.error ?? "Unknown error"}`,
            )
        }
    } catch (error) {
        void vscode.window.showErrorMessage(
            `❌ Call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
    }
}

export async function getOperations(): Promise<{
    success: boolean
    operations?: import("../webview-ui/src/components/StatesView").OperationNode[]
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
            operations: import("../webview-ui/src/components/StatesView").OperationNode[]
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
