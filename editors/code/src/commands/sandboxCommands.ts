//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"

import {SandboxTreeProvider} from "../providers/sandbox/SandboxTreeProvider"
import {SandboxActionsProvider, TransactionInfo} from "../providers/sandbox/SandboxActionsProvider"
import {HistoryWebviewProvider} from "../providers/sandbox/HistoryWebviewProvider"
import {DeployedContract} from "../common/types/contract"
import {
    callGetMethodDirectly,
    deleteContract,
    deleteMessageTemplate,
    exportTrace,
    importTrace,
    OperationTrace,
    redeployContract,
} from "../providers/sandbox/methods"
import {Operation} from "../webview-ui/src/views/actions/sandbox-actions-types"

export function registerSandboxCommands(
    treeProvider: SandboxTreeProvider,
    formProvider: SandboxActionsProvider,
    historyProvider: HistoryWebviewProvider,
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
        vscode.commands.registerCommand("ton.sandbox.openOperation", (operation: Operation) => {
            formProvider.openOperation(operation)
        }),
        vscode.commands.registerCommand(
            "ton.sandbox.openContractInfo",
            (contractAddress: string) => {
                formProvider.openOperation("contract-info", contractAddress)
            },
        ),
        vscode.commands.registerCommand("ton.sandbox.deployFromCodeLens", () => {
            vscode.commands
                .executeCommand("workbench.view.extension.tonSandboxContainer")
                .then(() => {
                    formProvider.openOperation("compile-deploy")
                })
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
                vscode.commands
                    .executeCommand("workbench.view.extension.tonSandboxContainer")
                    .then(() => {
                        formProvider.openOperation("send-message", address)
                    })
            },
        ),
        vscode.commands.registerCommand(
            "ton.sandbox.openContractGetMethodSend",
            (address: string, methodId: number) => {
                vscode.commands
                    .executeCommand("workbench.view.extension.tonSandboxContainer")
                    .then(() => {
                        formProvider.openOperation("get-method", address, methodId)
                    })
            },
        ),
        vscode.commands.registerCommand(
            "ton.sandbox.callGetMethodFromCodeLens",
            async (contract: DeployedContract, methodId: number) => {
                await callGetMethodDirectly(contract, methodId)
            },
        ),
        vscode.commands.registerCommand(
            "ton.sandbox.redeployContract",
            async (contract: DeployedContract) => {
                await redeployContract(contract, "1", formProvider, undefined, treeProvider)
            },
        ),
        vscode.commands.registerCommand("ton.sandbox.states.refresh", () => {
            void historyProvider.handleLoadOperations()
        }),
        vscode.commands.registerCommand("ton.sandbox.states.exportTrace", async () => {
            try {
                const result = await exportTrace()
                if (result.success) {
                    const traceJson = JSON.stringify(result.data, null, 2)
                    const blob = new Blob([traceJson], {type: "application/json"})

                    const filename = `ton-sandbox-trace-${new Date().toISOString().slice(0, 10)}.json`

                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
                    const defaultUri = workspaceFolder
                        ? vscode.Uri.joinPath(workspaceFolder.uri, filename)
                        : vscode.Uri.file(filename)

                    const uri = await vscode.window.showSaveDialog({
                        defaultUri,
                        filters: {
                            "JSON files": ["json"],
                            "All files": ["*"],
                        },
                        saveLabel: "Save Trace",
                    })

                    if (uri) {
                        await vscode.workspace.fs.writeFile(
                            uri,
                            new Uint8Array(await blob.arrayBuffer()),
                        )
                        void vscode.window.showInformationMessage(
                            `Trace exported successfully to ${uri.fsPath}`,
                        )
                    }
                } else {
                    void vscode.window.showErrorMessage(`Failed to export trace: ${result.error}`)
                }
            } catch (error) {
                console.error("Failed to export trace:", error)
                void vscode.window.showErrorMessage("Failed to export trace")
            }
        }),
        vscode.commands.registerCommand("ton.sandbox.states.resetState", () => {
            void historyProvider.handleResetState()
        }),
        vscode.commands.registerCommand("ton.sandbox.states.importTrace", async () => {
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]

                const uri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    defaultUri: workspaceFolder?.uri,
                    filters: {
                        "JSON files": ["json"],
                        "All files": ["*"],
                    },
                    openLabel: "Import Trace",
                })

                if (!uri || uri.length === 0) {
                    return
                }

                const fileContent = await vscode.workspace.fs.readFile(uri[0])
                const traceData = new TextDecoder().decode(fileContent)

                const trace = JSON.parse(traceData) as OperationTrace
                const result = await importTrace(trace)
                if (result.success) {
                    void vscode.window.showInformationMessage("Trace imported successfully")
                    void historyProvider.handleLoadOperations()
                    treeProvider.refresh()
                    await treeProvider.loadContractsFromServer()
                } else {
                    void vscode.window.showErrorMessage(`Failed to import trace: ${result.error}`)
                }
            } catch (error) {
                console.error("Failed to import trace:", error)
                void vscode.window.showErrorMessage("Failed to import trace: Invalid file format")
            }
        }),
        vscode.commands.registerCommand("ton.sandbox.debugTransaction", (operationId: string) => {
            historyProvider.handleDebugTransaction(operationId)
        }),
        vscode.commands.registerCommand(
            "ton.sandbox.startDebugSequence",
            (transactions: TransactionInfo[]) => {
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
                            `Failed to delete contract: ${deleteResult.error}`,
                        )
                    }
                } catch (error) {
                    void vscode.window.showErrorMessage(
                        `Failed to delete contract: ${error instanceof Error ? error.message : "Unknown error"}`,
                    )
                }
            },
        ),
        vscode.commands.registerCommand(
            "ton.sandbox.deleteMessageTemplate",
            async (treeItem: vscode.TreeItem) => {
                const templateId = treeItem.id?.replace("template-", "")
                if (!templateId) {
                    return
                }

                const confirm = await vscode.window.showWarningMessage(
                    "Are you sure you want to delete this message template?",
                    {modal: true},
                    "Delete",
                )

                if (confirm === "Delete") {
                    try {
                        const deleteResult = await deleteMessageTemplate(templateId)
                        if (deleteResult.success) {
                            treeProvider.removeMessageTemplate(templateId)
                            void vscode.window.showInformationMessage(
                                "Message template deleted successfully",
                            )
                        } else {
                            void vscode.window.showErrorMessage(
                                `Failed to delete message template: ${deleteResult.error}`,
                            )
                        }
                    } catch (error) {
                        void vscode.window.showErrorMessage(
                            `Failed to delete message template: ${error instanceof Error ? error.message : "Unknown error"}`,
                        )
                    }
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
