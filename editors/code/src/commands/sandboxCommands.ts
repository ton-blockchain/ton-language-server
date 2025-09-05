//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import {SandboxTreeProvider} from "../providers/SandboxTreeProvider"
import {SandboxFormProvider} from "../providers/SandboxFormProvider"
import {beginCell, Cell} from "@ton/core"
import {Message} from "@shared/abi"

export function registerSandboxCommands(
    treeProvider: SandboxTreeProvider,
    formProvider: SandboxFormProvider,
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = []

    disposables.push(
        vscode.commands.registerCommand("ton.sandbox.loadAbiForDeploy", async () => {
            await treeProvider.loadContractAbiForDeploy()
        }),
        vscode.commands.registerCommand("ton.sandbox.loadContractInfo", async (address: string) => {
            await treeProvider.loadContractInfo(address)
        }),
        vscode.commands.registerCommand(
            "ton.sandbox.compileAndDeploy",
            async (storageFields?: Record<string, string>) => {
                await treeProvider.compileAndDeployFromEditor(storageFields)
            },
        ),
        vscode.commands.registerCommand("ton.sandbox.sendMessageDialog", async () => {
            await showSendMessageDialog(treeProvider)
        }),
        vscode.commands.registerCommand("ton.sandbox.callGetMethodDialog", async () => {
            await showCallGetMethodDialog(treeProvider)
        }),
        vscode.commands.registerCommand("ton.sandbox.selectContract", async (address: string) => {
            await vscode.env.clipboard.writeText(address)
            void vscode.window.showInformationMessage(
                `Contract address copied to clipboard: ${address}`,
            )
        }),
        vscode.commands.registerCommand("ton.sandbox.refresh", () => {
            treeProvider.refresh()
        }),
        vscode.commands.registerCommand("ton.sandbox.clearContracts", () => {
            treeProvider.clearContracts()
            void vscode.window.showInformationMessage("Deployed contracts cleared")
        }),
        vscode.commands.registerCommand(
            "ton.sandbox.sendMessage",
            async (messageData: {
                contractAddress: string
                selectedMessage: string
                messageFields: Record<string, string>
                value: string
            }) => {
                await handleSendMessage(messageData, formProvider)
            },
        ),
        vscode.commands.registerCommand(
            "ton.sandbox.callGetMethod",
            async (methodData: {
                contractAddress: string
                selectedMethod: string
                methodId: string
            }) => {
                await handleCallGetMethod(methodData, formProvider)
            },
        ),
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
    )

    return disposables
}

async function showSendMessageDialog(treeProvider: SandboxTreeProvider): Promise<void> {
    const contracts = treeProvider.getDeployedContracts()

    if (contracts.length === 0) {
        void vscode.window.showWarningMessage("No contracts deployed. Deploy a contract first.")
        return
    }

    const contractItems = contracts.map(c => ({
        label: c.name,
        description: c.address,
        address: c.address,
    }))

    const selectedContract = await vscode.window.showQuickPick(contractItems, {
        placeHolder: "Select contract to send message to",
    })

    if (!selectedContract) {
        return
    }

    const message = await vscode.window.showInputBox({
        prompt: "Enter message (base64 Cell)",
        placeHolder: "te6ccgEBAQEAAgAAAA==",
    })

    if (!message) {
        return
    }

    const value = await vscode.window.showInputBox({
        prompt: "Enter value in TON (optional)",
        placeHolder: "1.0",
        value: "1.0",
    })

    try {
        const result = await sendMessage(selectedContract.address, message, value)
        if (result.success) {
            void vscode.window.showInformationMessage("Message sent successfully!")
        } else {
            void vscode.window.showErrorMessage(`Send failed: ${result.error}`)
        }
    } catch (error) {
        void vscode.window.showErrorMessage(
            `Send failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
    }
}

async function showCallGetMethodDialog(treeProvider: SandboxTreeProvider): Promise<void> {
    const contracts = treeProvider.getDeployedContracts()

    if (contracts.length === 0) {
        void vscode.window.showWarningMessage("No contracts deployed. Deploy a contract first.")
        return
    }

    const contractItems = contracts.map(c => ({
        label: c.name,
        description: c.address,
        address: c.address,
    }))

    const selectedContract = await vscode.window.showQuickPick(contractItems, {
        placeHolder: "Select contract to call method on",
    })

    if (!selectedContract) {
        return
    }

    const methodIdStr = await vscode.window.showInputBox({
        prompt: "Enter method ID",
        placeHolder: "0",
        value: "0",
        validateInput: value => {
            const num = Number.parseInt(value, 10)
            if (Number.isNaN(num)) {
                return "Method ID must be a number"
            }
            return null
        },
    })

    if (!methodIdStr) {
        return
    }

    const methodId = Number.parseInt(methodIdStr, 10)

    try {
        const result = await callGetMethod(selectedContract.address, methodId)
        if (result.success) {
            const message = `Method called successfully!\nResult: ${result.result}`
            void vscode.window.showInformationMessage(message)
        } else {
            void vscode.window.showErrorMessage(`Call failed: ${result.error}`)
        }
    } catch (error) {
        void vscode.window.showErrorMessage(
            `Call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
    }
}

async function sendMessage(
    address: string,
    message: string,
    value?: string,
): Promise<{
    success: boolean
    error?: string
}> {
    const config = vscode.workspace.getConfiguration("ton")
    const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

    const response = await fetch(`${sandboxUrl}/send`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({address, message, value}),
    })

    if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as {success: boolean; error?: string}
}

async function callGetMethod(
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

function buildStructuredMessage(
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
    const contracts = formProvider._deployedContracts

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

async function handleSendMessage(
    messageData: {
        contractAddress: string
        selectedMessage: string
        messageFields: Record<string, string>
        value: string
    },
    formProvider: SandboxFormProvider,
): Promise<void> {
    if (!messageData.contractAddress) {
        formProvider.showResult(
            {
                success: false,
                message: "Please select a contract first",
            },
            "send-message-result",
        )
        return
    }

    if (!messageData.selectedMessage) {
        formProvider.showResult(
            {
                success: false,
                message: "Please select a message first",
            },
            "send-message-result",
        )
        return
    }

    try {
        const messageBody = buildStructuredMessage(
            messageData.selectedMessage,
            messageData.messageFields,
            formProvider,
            messageData.contractAddress,
        )

        const result = await sendMessage(
            messageData.contractAddress,
            messageBody,
            messageData.value,
        )

        if (result.success) {
            formProvider.showResult(
                {
                    success: true,
                    message: `Message sent successfully to ${messageData.contractAddress}`,
                },
                "send-message-result",
            )
        } else {
            formProvider.showResult(
                {
                    success: false,
                    message: `Send failed: ${result.error ?? "Unknown error"}`,
                },
                "send-message-result",
            )
        }
    } catch (error) {
        formProvider.showResult(
            {
                success: false,
                message: `Send failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
            "send-message-result",
        )
    }
}

async function handleCallGetMethod(
    methodData: {
        contractAddress: string
        selectedMethod: string
        methodId: string
    },
    formProvider: SandboxFormProvider,
): Promise<void> {
    if (!methodData.contractAddress) {
        formProvider.showResult(
            {
                success: false,
                message: "Please select a contract first",
            },
            "get-method-result",
        )
        return
    }

    if (!methodData.methodId) {
        formProvider.showResult(
            {
                success: false,
                message: "Please enter method ID",
            },
            "get-method-result",
        )
        return
    }

    const methodId = Number.parseInt(methodData.methodId, 10)
    if (Number.isNaN(methodId)) {
        formProvider.showResult(
            {
                success: false,
                message: "Method ID must be a valid number",
            },
            "get-method-result",
        )
        return
    }

    try {
        const result = await callGetMethod(methodData.contractAddress, methodId)

        if (result.success) {
            const message = `Method called successfully!\nResult: ${result.result ?? "No result"}`
            const details = ""

            formProvider.showResult(
                {
                    success: true,
                    message,
                    details,
                },
                "get-method-result",
            )
        } else {
            formProvider.showResult(
                {
                    success: false,
                    message: `Call failed: ${result.error ?? "Unknown error"}`,
                },
                "get-method-result",
            )
        }
    } catch (error) {
        formProvider.showResult(
            {
                success: false,
                message: `Call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
            "get-method-result",
        )
    }
}

async function callGetMethodDirectly(
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
