//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"

import {Cell, loadTransaction} from "@ton/core"

import {
    StatesCommand,
    StatesMessage,
} from "../../webview-ui/src/views/history/sandbox-history-types"

import {
    processRawTransactions,
    RawTransactionInfo,
    RawTransactions,
} from "../../common/types/raw-transaction"
import {DeployedContract} from "../../common/types/contract"

import {getContracts, getOperations, OperationNode, restoreBlockchainState} from "./methods"

export class HistoryWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType: string = "tonSandboxHistory"

    private view?: vscode.WebviewView
    private operations: OperationNode[] = []
    private contracts: DeployedContract[] = []
    private isLoading: boolean = false

    public constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _treeProvider?: () => import("./SandboxTreeProvider").SandboxTreeProvider,
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.view = webviewView

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        }

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview)

        webviewView.webview.onDidReceiveMessage((command: StatesCommand) => {
            switch (command.type) {
                case "loadOperations": {
                    void this.handleLoadOperations()
                    break
                }
                case "webviewReady": {
                    break
                }
                case "restoreState": {
                    void this.handleRestoreState(command.eventId)
                    break
                }
                case "showTransactionDetails": {
                    void vscode.commands.executeCommand(
                        "ton.sandbox.showTransactionDetails",
                        command,
                    )
                    break
                }
                case "debugTransaction": {
                    this.handleDebugTransaction(command.operationId)
                    break
                }
                case "addTransactionsToDetails": {
                    void vscode.commands.executeCommand(
                        "ton.sandbox.addTransactionsToDetails",
                        command.resultString,
                    )
                    break
                }
            }
        })
    }

    public async handleLoadOperations(): Promise<void> {
        this.isLoading = true
        this.updateWebview()

        try {
            const [operationsResult, contractsResult] = await Promise.all([
                getOperations(),
                getContracts(),
            ])

            if (operationsResult.success) {
                this.operations = operationsResult.data.operations
            } else {
                console.error("Failed to load operations:", operationsResult.error)
                this.operations = []
            }

            if (contractsResult.success) {
                this.contracts = contractsResult.data.contracts
            } else {
                console.error("Failed to load contracts:", contractsResult.error)
                this.contracts = []
            }
        } catch (error) {
            console.error("Failed to load operations and contracts:", error)
            this.operations = []
            this.contracts = []
        } finally {
            this.isLoading = false
            this.updateWebview()
        }
    }

    public async handleRestoreState(eventId: string): Promise<void> {
        try {
            const result = await restoreBlockchainState(eventId)
            if (result.success) {
                void vscode.window.showInformationMessage("Blockchain state restored successfully")
                void this.handleLoadOperations()
                this.refreshTreeContracts()
            } else {
                void vscode.window.showErrorMessage(
                    `Failed to restore blockchain state: ${result.error}`,
                )
            }
        } catch (error) {
            console.error("Failed to restore blockchain state:", error)
            void vscode.window.showErrorMessage("Failed to restore blockchain state")
        }
    }

    private refreshTreeContracts(): void {
        if (this._treeProvider) {
            this._treeProvider().refresh()
        }
    }

    private parseMaybeTransactions(data: string): RawTransactions | undefined {
        try {
            return JSON.parse(data) as RawTransactions
        } catch {
            return undefined
        }
    }

    public handleDebugTransaction(operationId: string): void {
        try {
            const operation = this.operations.find(op => op.id === operationId)
            if (!operation) {
                void vscode.window.showErrorMessage(`Operation ${operationId} not found`)
                return
            }

            if (!operation.resultString) {
                void vscode.window.showErrorMessage(
                    `No transaction data available for operation ${operationId}`,
                )
                return
            }

            const rawTxs = this.parseMaybeTransactions(operation.resultString)
            if (!rawTxs) {
                void vscode.window.showErrorMessage("No transaction found")
                return
            }

            const parsedTransactions = rawTxs.transactions.map(
                (it): RawTransactionInfo => ({
                    ...it,
                    transaction: it.transaction,
                    parsedTransaction: loadTransaction(Cell.fromHex(it.transaction).asSlice()),
                }),
            )

            const transactionInfos = processRawTransactions(parsedTransactions)

            const transactions = transactionInfos.flatMap((tx, index) => {
                const contractName = tx.contractName ?? `TX_${index + 1}`

                if (tx.code === undefined || operation.contractName === "treasury") {
                    return []
                }

                return [
                    {
                        vmLogs: tx.fields.vmLogs as string,
                        code: tx.code.toBoc().toString("hex"),
                        contractName: `${contractName}_TX_${index + 1}`,
                        sourceMap: tx.sourceMap,
                    },
                ]
            })

            if (transactions.length === 0) {
                void vscode.window.showErrorMessage("No transactions to debug")
                return
            }

            void vscode.commands.executeCommand("ton.sandbox.startDebugSequence", transactions)
        } catch (error) {
            console.error("Failed to debug transaction:", error)
            void vscode.window.showErrorMessage("Failed to start debugging transaction")
        }
    }

    private updateWebview(): void {
        if (this.view) {
            const message: StatesMessage = {
                type: "updateOperations",
                operations: this.operations,
                contracts: this.contracts,
                isLoading: this.isLoading,
            }
            void this.view.webview.postMessage(message)
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "dist", "webview-ui", "history.js"),
        )
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "dist", "webview-ui", "history.css"),
        )

        const nonce = getNonce()

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri.toString()}" rel="stylesheet">
                <title>TON States</title>
            </head>
            <body>
                <div id="root"></div>
                <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
            </body>
            </html>`
    }
}

function getNonce(): string {
    let text = ""
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}
