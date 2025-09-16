//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import {OperationNode} from "../webview-ui/src/components/StatesView"
import {StatesCommand, StatesMessage} from "../webview-ui/src/states-types"
import {getOperations, restoreBlockchainState} from "../commands/sandboxCommands"
import {processRawTransactions, RawTransactions} from "./lib/raw-transaction"

export class StatesWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType: string = "tonSandboxHistory"

    private view?: vscode.WebviewView
    private operations: OperationNode[] = []
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
                    void this.handleLoadOperations()
                    break
                }
                case "restoreState": {
                    void this.handleRestoreState(command.eventId)
                    break
                }
                case "showTransactionDetails": {
                    void this.handleShowTransactionDetails(
                        command.contractAddress,
                        command.methodName,
                        command.transactionId,
                        command.timestamp,
                        command.resultString,
                    )
                    break
                }
                case "debugTransaction": {
                    this.handleDebugTransaction(command.operationId)
                    break
                }
            }
        })
    }

    public async handleLoadOperations(): Promise<void> {
        this.isLoading = true
        this.updateWebview()

        try {
            const result = await getOperations()

            if (result.success && result.operations) {
                this.operations = result.operations
            } else {
                console.error("Failed to load operations:", result.error)
                // Fallback to empty array
                this.operations = []
            }
        } catch (error) {
            console.error("Failed to load operations:", error)
            this.operations = []
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

            const transactionInfos = processRawTransactions(rawTxs.transactions)

            const transactions = transactionInfos.map((tx, index) => {
                const contractName =
                    operation.contractName ??
                    operation.fromContract?.name ??
                    operation.toContract?.name ??
                    `TX_${index + 1}`

                return {
                    vmLogs: tx.fields.vmLogs as string,
                    code: tx.code ? tx.code.toString() : "",
                    contractName: `${contractName}_TX_${index + 1}`,
                    sourceMap: undefined, // TODO: We could store source maps in operations if needed
                }
            })

            if (transactions.length === 0) {
                void vscode.window.showErrorMessage("No transactions to debug")
                return
            }

            // formProvider.startSequentialDebugging(transactions)
        } catch (error) {
            console.error("Failed to debug transaction:", error)
            void vscode.window.showErrorMessage("Failed to start debugging transaction")
        }
    }

    private async handleShowTransactionDetails(
        contractAddress: string,
        methodName: string,
        transactionId?: string,
        timestamp?: string,
        resultString?: string,
    ): Promise<void> {
        try {
            await vscode.commands.executeCommand("ton.sandbox.showTransactionDetails", {
                contractAddress,
                methodName,
                transactionId,
                timestamp,
                resultString,
            })
        } catch (error) {
            console.error("Failed to show transaction details:", error)
            void vscode.window.showErrorMessage("Failed to show transaction details")
        }
    }

    private updateWebview(): void {
        if (this.view) {
            const message: StatesMessage = {
                type: "updateOperations",
                operations: this.operations,
                isLoading: this.isLoading,
            }
            this.view.webview.postMessage(message)
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "dist", "webview-ui", "states", "main.js"),
        )
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "dist", "webview-ui", "states", "main.css"),
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
