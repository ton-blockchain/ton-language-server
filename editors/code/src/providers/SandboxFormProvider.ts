//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import {ContractAbi} from "@shared/abi"
import {
    VSCodeCommand,
    UpdateContractsMessage,
    ShowResultMessage,
    OpenOperationMessage,
    UpdateStorageFieldsMessage,
    UpdateContractInfoMessage,
    Operation,
} from "../webview-ui/src/types"

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

        webviewView.webview.onDidReceiveMessage((command: VSCodeCommand) => {
            switch (command.type) {
                case "sendMessage": {
                    void vscode.commands.executeCommand("ton.sandbox.sendMessage", {
                        contractAddress: command.contractAddress,
                        selectedMessage: command.selectedMessage,
                        messageFields: command.messageFields,
                        value: command.value,
                    })
                    break
                }
                case "callGetMethod": {
                    void vscode.commands.executeCommand("ton.sandbox.callGetMethod", {
                        contractAddress: command.contractAddress,
                        selectedMethod: command.selectedMethod,
                        methodId: command.methodId,
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
                        command.contractAddress,
                    )
                    break
                }
                case "compileAndDeploy": {
                    void vscode.commands.executeCommand(
                        "ton.sandbox.compileAndDeploy",
                        command.storageFields,
                    )
                    break
                }
            }
        })
    }

    public updateContracts(contracts: {address: string; name: string; abi?: ContractAbi}[]): void {
        this._deployedContracts = contracts
        if (this._view) {
            const message: UpdateContractsMessage = {
                type: "updateContracts",
                contracts: this._deployedContracts,
            }
            void this._view.webview.postMessage(message)
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
            const message: ShowResultMessage = {
                type: "showResult",
                result,
                resultId,
            }
            void this._view.webview.postMessage(message)
        }
    }

    public openOperation(operation: string, contractAddress?: string): void {
        if (this._view) {
            const message: OpenOperationMessage = {
                type: "openOperation",
                operation: operation as Operation,
                contractAddress,
            }
            void this._view.webview.postMessage(message)
        }
    }

    public updateStorageFields(abi: ContractAbi): void {
        if (this._view) {
            const message: UpdateStorageFieldsMessage = {
                type: "updateStorageFields",
                abi,
            }
            void this._view.webview.postMessage(message)
        }
    }

    public updateContractInfo(info: {account: string}): void {
        if (this._view) {
            const message: UpdateContractInfoMessage = {
                type: "updateContractInfo",
                info,
            }
            void this._view.webview.postMessage(message)
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
