//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as vscode from "vscode"

import {TestTreeProvider} from "./TestTreeProvider"
import {TestDataMessage} from "./test-types"

interface TestCommand {
    readonly type: "clearAllTests" | "removeTest" | "showTransactionDetails"
    readonly testId?: string
    readonly testRunId?: string
    readonly transactionId?: string
}

interface TestMessage {
    readonly type: "addTestData"
    readonly data: TestDataMessage
}

export class TestWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType: string = "tonTestResults"

    private view?: vscode.WebviewView

    public constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _treeProvider: TestTreeProvider,
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

        webviewView.webview.onDidReceiveMessage((command: TestCommand) => {
            switch (command.type) {
                case "clearAllTests": {
                    this._treeProvider.clearAllTests()
                    break
                }
                case "removeTest": {
                    if (command.testId) {
                        this._treeProvider.removeTestRun(command.testId)
                    }
                    break
                }
                case "showTransactionDetails": {
                    if (command.testRunId && command.transactionId) {
                        const testRun = this._treeProvider.getTestRun(command.testRunId)
                        if (testRun) {
                            // const transaction = testRun.transactions.find(
                            //     tx => tx.id === command.transactionId,
                            // )
                            // if (transaction) {
                            //     // Здесь можно открыть детали транзакции
                            //     vscode.window.showInformationMessage(
                            //         `Transaction Details: ${transaction.address} (LT: ${transaction.lt})`,
                            //     )
                            // }
                        }
                    }
                    break
                }
                default: {
                    console.warn("Unknown command type:", command.type)
                }
            }
        })
    }

    public addTestData(data: TestDataMessage): void {
        this._treeProvider.addTestData(data)

        // Отправляем данные в webview
        if (this.view) {
            const message: TestMessage = {
                type: "addTestData",
                data,
            }
            void this.view.webview.postMessage(message)
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "dist", "webview-ui", "tests.js"),
        )
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "dist", "webview-ui", "tests.css"),
        )

        const nonce = getNonce()

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri.toString()}" rel="stylesheet">
                <title>Test Results</title>
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
