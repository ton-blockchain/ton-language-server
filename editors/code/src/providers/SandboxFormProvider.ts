//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import {ContractAbi} from "@shared/abi"

export class SandboxFormProvider implements vscode.WebviewViewProvider {
    public static readonly viewType: string = "tonSandboxForm"

    private _view?: vscode.WebviewView
    public _deployedContracts: {address: string; name: string; abi?: ContractAbi}[] = []

    public constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this._view = webviewView

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        }

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

        webviewView.webview.onDidReceiveMessage((data: {type: string; [key: string]: unknown}) => {
            switch (data.type) {
                case "sendMessage": {
                    void vscode.commands.executeCommand("ton.sandbox.sendMessage", {
                        contractAddress: data.contractAddress,
                        selectedMessage: data.selectedMessage,
                        messageFields: data.messageFields,
                        value: data.value,
                    })
                    break
                }
                case "callGetMethod": {
                    void vscode.commands.executeCommand("ton.sandbox.callGetMethod", {
                        contractAddress: data.contractAddress,
                        selectedMethod: data.selectedMethod,
                        methodId: data.methodId,
                    })
                    break
                }
                case "loadAbiForDeploy": {
                    void vscode.commands.executeCommand("ton.sandbox.loadAbiForDeploy")
                    break
                }
                case "loadContractInfo": {
                    void vscode.commands.executeCommand(
                        "ton.sandbox.loadContractInfo",
                        data.contractAddress,
                    )
                    break
                }
                case "compileAndDeploy": {
                    void vscode.commands.executeCommand(
                        "ton.sandbox.compileAndDeploy",
                        data.storageFields,
                    )
                    break
                }
            }
        })
    }

    public updateContracts(contracts: {address: string; name: string; abi?: ContractAbi}[]): void {
        this._deployedContracts = contracts
        if (this._view) {
            void this._view.webview.postMessage({
                type: "updateContracts",
                contracts: this._deployedContracts,
            })
        }
    }

    public showResult(
        result: {
            success: boolean
            message: string
            details?: string
        },
        resultId?: string,
    ): void {
        if (this._view) {
            void this._view.webview.postMessage({
                type: "showResult",
                result,
                resultId,
            })
        }
    }

    public openOperation(operation: string, contractAddress?: string): void {
        if (this._view) {
            void this._view.webview.postMessage({
                type: "openOperation",
                operation,
                contractAddress,
            })
        }
    }

    public updateStorageFields(abi: ContractAbi): void {
        if (this._view) {
            void this._view.webview.postMessage({
                type: "updateStorageFields",
                abi,
            })
        }
    }

    public updateContractInfo(info: {account: string}): void {
        if (this._view) {
            void this._view.webview.postMessage({
                type: "updateContractInfo",
                info,
            })
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "dist", "webview-ui", "main.js"),
        )
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "dist", "webview-ui", "main.css"),
        )

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sandbox Operations</title>
    <link rel="stylesheet" type="text/css" href="${styleUri.toString()}">
</head>
<body style="padding: 0">
    <div id="root"></div>
    <script type="module" src="${scriptUri.toString()}"></script>
</body>
</html>`
    }
}
