//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import vscode from "vscode"

import {ContractAbi} from "@shared/abi"

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
    loadContractInfo,
    loadLatestOperationResult,
    OperationTrace,
    redeployContract,
} from "../providers/sandbox/methods"
import {
    Operation,
    ShowTransactionDetailsCommand,
} from "../webview-ui/src/views/actions/sandbox-actions-types"
import {TransactionDetailsProvider} from "../providers/sandbox/TransactionDetailsProvider"
import {HexString} from "../common/hex-string"
import {Base64String} from "../common/base64-string"
import {TransactionDetailsInfo} from "../common/types/transaction"
import {TolkTestController} from "../providers/sandbox/TolkTestController"
import {
    detectPackageManager,
    getInstallCommand,
    getLocalBinaryPath,
} from "../common/package-manager"
import {RawTransactions} from "../common/types/raw-transaction"

export function registerSandboxCommands(
    treeProvider: SandboxTreeProvider,
    formProvider: SandboxActionsProvider,
    historyProvider: HistoryWebviewProvider,
    transactionDetailsProvider: TransactionDetailsProvider,
    testController: TolkTestController,
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = []

    disposables.push(
        vscode.commands.registerCommand("ton.sandbox.refresh", () => {
            treeProvider.refresh(true)
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
            "ton.sandbox.copyContractAddressFromTree",
            async (treeItem: vscode.TreeItem) => {
                const contractAddress = treeItem.id?.replace("contract-", "")
                if (!contractAddress) {
                    return
                }

                await vscode.env.clipboard.writeText(contractAddress)
                void vscode.window.showInformationMessage(
                    `Contract address copied: ${contractAddress}`,
                )
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
                await redeployContract(treeProvider, contract, "1", formProvider, undefined)
            },
        ),
        vscode.commands.registerCommand("ton.sandbox.history.refresh", () => {
            void historyProvider.handleLoadOperations()
        }),
        vscode.commands.registerCommand("ton.sandbox.history.reset", () => {
            void historyProvider.handleResetState()
        }),
        vscode.commands.registerCommand("ton.sandbox.history.exportTrace", async () => {
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
        vscode.commands.registerCommand("ton.sandbox.history.importTrace", async () => {
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
        vscode.commands.registerCommand("ton.sandbox.installServer", async () => {
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
                if (!workspaceFolder) {
                    void vscode.window.showErrorMessage(
                        "No workspace folder found. Please open project first!",
                    )
                    return
                }

                const packageManager = await detectPackageManager(workspaceFolder)
                const installCommand = getInstallCommand(packageManager, "ton-sandbox-server-dev")

                const terminal =
                    vscode.window.terminals.find(t => t.name === "TON Sandbox Installation") ??
                    vscode.window.createTerminal("TON Sandbox Installation")
                terminal.show()

                terminal.sendText(installCommand)

                setTimeout(() => {
                    treeProvider.refresh()
                }, 2000)
                setTimeout(() => {
                    treeProvider.refresh()
                }, 3000)
                setTimeout(() => {
                    treeProvider.refresh()
                }, 5000)
            } catch (error) {
                void vscode.window.showErrorMessage(
                    `Failed to start installation: ${error instanceof Error ? error.message : "Unknown error"}`,
                )
            }
        }),
        vscode.commands.registerCommand("ton.sandbox.startServer", async () => {
            try {
                const config = vscode.workspace.getConfiguration("ton")
                const binaryPath =
                    config.get<string | undefined>("sandbox.binaryPath", undefined) ??
                    (await getLocalBinaryPath("ton-sandbox-server")) ??
                    "ton-sandbox-server"

                const port = config.get<number>("sandbox.port", 3000)

                const terminal =
                    vscode.window.terminals.find(t => t.name === "TON Sandbox Server") ??
                    vscode.window.createTerminal({
                        name: "TON Sandbox Server",
                        isTransient: false,
                        iconPath: new vscode.ThemeIcon("server"),
                        hideFromUser: true,
                    })

                // terminal.sendText("LOG_LEVEL=TRACE ts-node ~/sandbox/src/daemon.ts")
                terminal.sendText(`${binaryPath} --port ${port}`)

                setTimeout(() => {
                    treeProvider.refresh(true)
                }, 2000)
                setTimeout(() => {
                    treeProvider.refresh(true)
                }, 3000)
                setTimeout(() => {
                    treeProvider.refresh(true)
                }, 5000)
            } catch (error) {
                void vscode.window.showErrorMessage(
                    `Failed to start TON Sandbox server: ${error instanceof Error ? error.message : "Unknown error"}`,
                )
            }
        }),
        vscode.commands.registerCommand("ton.sandbox.stopServer", () => {
            try {
                const sandboxTerminal = vscode.window.terminals.find(
                    t => t.name === "TON Sandbox Server",
                )

                if (!sandboxTerminal) {
                    return
                }

                sandboxTerminal.sendText("\u0003")

                void vscode.window.showInformationMessage("Stopping TON Sandbox server...")

                setTimeout(() => {
                    treeProvider.refresh()
                }, 1000)
                setTimeout(() => {
                    treeProvider.refresh()
                }, 2000)
            } catch (error) {
                void vscode.window.showErrorMessage(
                    `Failed to stop TON Sandbox server: ${error instanceof Error ? error.message : "Unknown error"}`,
                )
            }
        }),
        vscode.commands.registerCommand("ton.sandbox.openTerminal", () => {
            try {
                const terminal = vscode.window.terminals.find(t => t.name === "TON Sandbox Server")
                if (!terminal) {
                    void vscode.window.showInformationMessage("TON Sandbox server is not running")
                    return
                }

                terminal.show()
            } catch (error) {
                void vscode.window.showErrorMessage(
                    `Failed to open sandbox terminal: ${error instanceof Error ? error.message : "Unknown error"}`,
                )
            }
        }),
        vscode.commands.registerCommand(
            "ton.sandbox.showTransactionDetails",
            async (args?: ShowTransactionDetailsCommand): Promise<void> => {
                if (!args) {
                    vscode.window.showErrorMessage(
                        `Missing arguments for showTransactionDetails command`,
                    )
                    return
                }

                const deployedContracts = treeProvider.getDeployedContracts()

                let account: HexString | undefined
                let stateInit: {code: Base64String; data: Base64String} | undefined
                let abi: ContractAbi | undefined
                let resultString = args.resultString

                try {
                    const contractInfo = await loadContractInfo(args.contractAddress)
                    if (contractInfo.success) {
                        account = contractInfo.data.account
                        stateInit = contractInfo.data.stateInit
                        abi = contractInfo.data.abi
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(
                        `Failed to fetch contract info from server: ${error}`,
                    )
                    console.warn("Failed to fetch contract info from server:", error)
                }

                if (!resultString) {
                    try {
                        const latestOperationResult = await loadLatestOperationResult()
                        if (latestOperationResult.success) {
                            resultString = latestOperationResult.data.resultString
                        } else {
                            const message = `Failed to load latest operation result: ${latestOperationResult.error}`
                            vscode.window.showErrorMessage(message)
                            console.warn(message)
                        }
                    } catch (error) {
                        vscode.window.showErrorMessage(
                            `Failed to fetch latest operation result from daemon: ${error}`,
                        )
                        console.warn("Failed to fetch latest operation result from daemon:", error)
                    }
                }

                const transaction: TransactionDetailsInfo = {
                    contractAddress: args.contractAddress,
                    methodName: args.methodName,
                    transactionId: args.transactionId,
                    timestamp: args.timestamp,
                    status: args.status,
                    resultString,
                    deployedContracts,
                    account,
                    stateInit,
                    abi,
                }

                transactionDetailsProvider.showTransactionDetails(transaction)
            },
        ),
        vscode.commands.registerCommand(
            "ton.sandbox.addTransactionsToDetails",
            (resultString: string): void => {
                transactionDetailsProvider.addTransactions(resultString)
            },
        ),
        vscode.commands.registerCommand(
            "ton.debugTest",
            async (filePath: string, testName: string) => {
                try {
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
                    if (!workspaceFolder) {
                        void vscode.window.showErrorMessage("No workspace folder found")
                        return
                    }

                    const terminal =
                        vscode.window.terminals.find(t => t.name === "TON Test Runner") ??
                        vscode.window.createTerminal({
                            name: "TON Test Runner",
                            cwd: workspaceFolder.uri.fsPath,
                        })

                    terminal.show()
                    terminal.sendText(
                        `./target/debug/acton test "${filePath}" --filter "${testName}" --debug`,
                    )

                    await new Promise(resolve => setTimeout(resolve, 1500))

                    const success = await vscode.debug.startDebugging(undefined, {
                        type: "tolk",
                        name: `Debug Test: ${testName}`,
                        request: "launch",
                        filePath: filePath,
                        testName: testName,
                        stopOnEntry: true,
                    })

                    if (!success) {
                        console.error("Failed to start test debugging session")
                    }
                } catch (error) {
                    void vscode.window.showErrorMessage(
                        `Failed to run test: ${error instanceof Error ? error.message : "Unknown error"}`,
                    )
                }
            },
        ),
        vscode.commands.registerCommand("ton.runTest", async (testItem?: vscode.TestItem) => {
            try {
                if (testItem) {
                    // Run single test
                    const request = new vscode.TestRunRequest([testItem])
                    await testController.runTests(
                        request,
                        new vscode.CancellationTokenSource().token,
                    )
                } else {
                    // Run all tests
                    const request = new vscode.TestRunRequest()
                    await testController.runTests(
                        request,
                        new vscode.CancellationTokenSource().token,
                    )
                }
            } catch (error) {
                void vscode.window.showErrorMessage(
                    `Failed to run test: ${error instanceof Error ? error.message : "Unknown error"}`,
                )
            }
        }),
        vscode.commands.registerCommand("ton.debug.showVariableValue", (variable: unknown) => {
            const varData = variable as {variable?: {value?: string}} | undefined
            const value = varData?.variable?.value
            if (value) {
                const txs = value.startsWith("(")
                    ? value
                          .slice(1, -1)
                          .split(",")
                          .map(tx => tx.trim())
                    : [value]
                transactionDetailsProvider.showTransactionDetails({
                    methodName: "",
                    status: "success",
                    timestamp: "",
                    contractAddress: "",
                    resultString: JSON.stringify({
                        transactions: txs.map(tx => ({
                            transaction: tx,
                            parsedTransaction: undefined,
                            fields: {},
                            code: undefined,
                            sourceMap: undefined,
                            contractName: undefined,
                            parentId: undefined,
                            childrenIds: [],
                            oldStorage: undefined,
                            newStorage: undefined,
                        })),
                    } satisfies RawTransactions),
                })

                // void vscode.window.showInformationMessage(
                //     `Variable value: ${varData.variable.value}`,
                // )
            } else {
                void vscode.window.showWarningMessage("No variable value available")
            }
        }),
    )

    return disposables
}

export function openFileAtPosition(uri: string, row: number, column: number): void {
    const fileUri = vscode.Uri.parse(uri)
    const position = new vscode.Position(row, column)

    vscode.workspace.openTextDocument(fileUri).then(document => {
        void vscode.window.showTextDocument(document, {
            selection: new vscode.Range(position, position),
        })
    })
}
