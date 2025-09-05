//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import {ContractAbi} from "@shared/abi"

export interface FormData {
    readonly sendContract?: string
    readonly getContract?: string
    readonly infoContract?: string
    readonly messageType?: "raw" | "structured"
    readonly selectedMessage?: string
    readonly messageFields?: Record<string, string>
    readonly value?: string
    readonly methodId?: string
    readonly selectedMethod?: string
    readonly storageFields?: Record<string, string>
}

export class SandboxFormProvider implements vscode.WebviewViewProvider {
    public static readonly viewType: string = "tonSandboxForm"

    private _view?: vscode.WebviewView
    private _formData: FormData = {}
    public _deployedContracts: {address: string; name: string; abi?: ContractAbi}[] = []

    private readonly _onDidChangeFormData: vscode.EventEmitter<FormData> =
        new vscode.EventEmitter<FormData>()

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

        webviewView.webview.onDidReceiveMessage((data: {type: string; formData: FormData}) => {
            switch (data.type) {
                case "formDataChanged": {
                    this._formData = {...this._formData, ...data.formData}
                    this._onDidChangeFormData.fire(this._formData)
                    break
                }
                case "sendMessage": {
                    void vscode.commands.executeCommand(
                        "ton.sandbox.sendMessageFromForm",
                        this._formData,
                    )
                    break
                }
                case "callGetMethod": {
                    void vscode.commands.executeCommand(
                        "ton.sandbox.callGetMethodFromForm",
                        this._formData,
                    )
                    break
                }
                case "loadAbiForDeploy": {
                    void vscode.commands.executeCommand("ton.sandbox.loadAbiForDeploy")
                    break
                }
                case "loadContractInfo": {
                    console.log("message loadContractInfo", this._formData)
                    void vscode.commands.executeCommand(
                        "ton.sandbox.loadContractInfo",
                        this._formData.infoContract,
                    )
                    break
                }
                case "compileAndDeploy": {
                    void vscode.commands.executeCommand("ton.sandbox.compileAndDeploy")
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

    public getFormData(): FormData {
        return {...this._formData}
    }

    public updateFormData(data: Partial<FormData>): void {
        this._formData = {...this._formData, ...data}
        if (this._view) {
            void this._view.webview.postMessage({
                type: "updateFormData",
                formData: this._formData,
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
