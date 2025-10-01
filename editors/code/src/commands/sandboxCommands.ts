//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"

import {SandboxTreeProvider} from "../providers/sandbox/SandboxTreeProvider"
import {SandboxActionsProvider} from "../providers/sandbox/SandboxActionsProvider"
import {HistoryWebviewProvider} from "../providers/sandbox/HistoryWebviewProvider"
import {DeployedContract} from "../common/types/contract"
import {callGetMethodDirectly, deleteContract} from "../providers/sandbox/methods"
import {Operation} from "../webview-ui/src/views/actions/sandbox-actions-types"

export function registerSandboxCommands(
    treeProvider: SandboxTreeProvider,
    formProvider: SandboxActionsProvider,
    statesProvider: HistoryWebviewProvider,
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
            async (contract: DeployedContract, methodId: number) => {
                await callGetMethodDirectly(contract, methodId)
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
            (
                transactions: import("../providers/sandbox/SandboxActionsProvider").TransactionInfo[],
            ) => {
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
