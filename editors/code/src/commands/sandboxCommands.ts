//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import {SandboxTreeProvider} from "../providers/SandboxTreeProvider"
import {SandboxFormProvider} from "../providers/SandboxFormProvider"
import {StatesWebviewProvider} from "../providers/StatesWebviewProvider"
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
        vscode.commands.registerCommand(
            "ton.sandbox.deleteContract",
            async (contractAddress: string) => {
                try {
                    const deleteResult = await deleteContract(contractAddress)
                    if (deleteResult.success) {
                        treeProvider.removeContract(contractAddress)
                        await treeProvider.loadContractsFromServer()
                        void vscode.window.showInformationMessage("Contract deleted successfully")
                    } else {
                        void vscode.window.showErrorMessage(
                            `Failed to delete contract: ${deleteResult.error ?? "Unknown error"}`,
                        )
                    }
                } catch (error) {
                    void vscode.window.showErrorMessage(
                        `Failed to delete contract: ${error instanceof Error ? error.message : "Unknown error"}`,
                    )
                }
            },
        ),
        vscode.commands.registerCommand("ton.sandbox.copyContractAbi", async () => {
            try {
                const activeEditor = vscode.window.activeTextEditor
                if (!activeEditor) {
                    void vscode.window.showWarningMessage("No active editor found")
                    return
                }

                const document = activeEditor.document
                const filePath = document.uri.fsPath

                if (!filePath.endsWith(".tolk")) {
                    void vscode.window.showWarningMessage(
                        "Active file is not a Tolk contract (.tolk)",
                    )
                    return
                }

                const abiResult = await vscode.commands.executeCommand("tolk.getContractAbi", {
                    textDocument: {
                        uri: document.uri.toString(),
                    },
                })

                if (!abiResult) {
                    void vscode.window.showWarningMessage("Failed to get contract ABI")
                    return
                }

                const abiJson = JSON.stringify(abiResult, null, 2)

                await vscode.env.clipboard.writeText(abiJson)

                void vscode.window.showInformationMessage("Contract ABI copied to clipboard")
            } catch (error) {
                void vscode.window.showErrorMessage(
                    `Failed to copy contract ABI: ${error instanceof Error ? error.message : "Unknown error"}`,
                )
            }
        }),
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
    messageBody: string
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
