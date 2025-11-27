//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as vscode from "vscode"

import {TransactionDetailsInfo} from "../../common/types/transaction"
import {openFileAtPosition} from "../../commands/sandboxCommands"
import {OpenFileAtPositionCommand} from "../../webview-ui/src/views/details/transaction-details-types"

export class TransactionDetailsProvider {
    public static readonly viewType: string = "tonTransactionDetails"

    private panel?: vscode.WebviewPanel
    private currentTransaction?: TransactionDetailsInfo

    public constructor(private readonly _extensionUri: vscode.Uri) {}

    public showTransactionDetails(transaction: TransactionDetailsInfo): void {
        this.currentTransaction = transaction

        if (this.panel) {
            this.updateTransactionDetails(transaction)
            this.panel.reveal(vscode.ViewColumn.One, true)
        } else {
            this.panel = vscode.window.createWebviewPanel(
                TransactionDetailsProvider.viewType,
                "Transaction Details",
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [this._extensionUri],
                    retainContextWhenHidden: true,
                },
            )

            this.panel.iconPath = {
                light: vscode.Uri.joinPath(this._extensionUri, "dist", "icons", "sandbox-icon.svg"),
                dark: vscode.Uri.joinPath(
                    this._extensionUri,
                    "dist",
                    "icons",
                    "sandbox-icon-dark.svg",
                ),
            }

            this.panel.webview.html = this.getHtmlForWebview(this.panel.webview)

            this.panel.webview.onDidReceiveMessage((message: OpenFileAtPositionCommand) => {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (message.type === "openFileAtPosition") {
                    openFileAtPosition(message.uri, message.row, message.column)
                }
            })

            this.panel.onDidDispose(() => {
                this.panel = undefined
            })

            this.updateTransactionDetails(this.currentTransaction)
        }
    }

    private updateTransactionDetails(transaction: TransactionDetailsInfo): void {
        if (this.panel) {
            void this.panel.webview.postMessage({
                type: "updateTransactionDetails",
                transaction,
            })
        }
    }

    public addTransactions(serializedResult: string): void {
        if (this.panel) {
            void this.panel.webview.postMessage({
                type: "addTransactions",
                serializedResult,
            })
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "dist", "webview-ui", "transaction-details.js"),
        )
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri,
                "dist",
                "webview-ui",
                "transaction-details.css",
            ),
        )

        const scriptUriString = scriptUri.toString()
        const styleUriString = styleUri.toString()

        const nonce = getNonce()

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUriString}" rel="stylesheet">
    <title>Transaction Details</title>
</head>
<body>
    <div id="transaction-details-root"></div>
    <script nonce="${nonce}" src="${scriptUriString}"></script>
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
