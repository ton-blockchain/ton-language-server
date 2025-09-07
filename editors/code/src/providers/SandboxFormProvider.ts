//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import {ContractAbi} from "@shared/abi"
import {
    VSCodeCommand,
    UpdateContractsMessage,
    ShowResultMessage,
    OpenOperationMessage,
    UpdateContractAbiMessage,
    UpdateContractInfoMessage,
    UpdateActiveEditorMessage,
    Operation,
} from "../webview-ui/src/types"
import {sendMessage, callGetMethod, buildStructuredMessage} from "../commands/sandboxCommands"
import {compileAndDeployFromEditor, loadContractAbiForDeploy, loadContractInfo} from "./methods"

export class SandboxFormProvider implements vscode.WebviewViewProvider {
    public static readonly viewType: string = "tonSandboxForm"

    private view?: vscode.WebviewView
    public deployedContracts: {address: string; name: string; abi?: ContractAbi}[] = []

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

        webviewView.webview.onDidReceiveMessage((command: VSCodeCommand) => {
            switch (command.type) {
                case "sendMessage": {
                    void this.handleSendMessage(command)
                    break
                }
                case "callGetMethod": {
                    void this.handleCallGetMethod(command)
                    break
                }
                case "loadAbiForDeploy": {
                    void this.handleLoadAbiForDeploy()
                    break
                }
                case "loadContractInfo": {
                    void this.handleLoadContractInfo(command.contractAddress)
                    break
                }
                case "compileAndDeploy": {
                    void this.handleCompileAndDeploy(command.name, command.storageFields)
                    break
                }
                case "webviewReady": {
                    if (this.deployedContracts.length > 0) {
                        this.updateContracts(this.deployedContracts)
                    }
                    break
                }
            }
        })
    }

    public updateContracts(contracts: {address: string; name: string; abi?: ContractAbi}[]): void {
        this.deployedContracts = contracts
        if (this.view && contracts.length > 0) {
            const message: UpdateContractsMessage = {
                type: "updateContracts",
                contracts: this.deployedContracts,
            }
            void this.view.webview.postMessage(message)
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
        if (this.view) {
            const message: ShowResultMessage = {
                type: "showResult",
                result,
                resultId,
            }
            void this.view.webview.postMessage(message)
        }
    }

    public openOperation(operation: string, contractAddress?: string): void {
        if (this.view) {
            const message: OpenOperationMessage = {
                type: "openOperation",
                operation: operation as Operation,
                contractAddress,
            }
            void this.view.webview.postMessage(message)
        }
    }

    public updateContractAbi(abi: ContractAbi): void {
        if (this.view) {
            const message: UpdateContractAbiMessage = {
                type: "updateContractAbi",
                abi,
            }
            void this.view.webview.postMessage(message)
        }
    }

    public updateContractInfo(info: {account: string}): void {
        if (this.view) {
            const message: UpdateContractInfoMessage = {
                type: "updateContractInfo",
                info,
            }
            void this.view.webview.postMessage(message)
        }
    }

    public updateActiveEditor(
        document: {uri: string; languageId: string; content: string} | null,
    ): void {
        if (this.view) {
            const message: UpdateActiveEditorMessage = {
                type: "updateActiveEditor",
                document,
            }
            void this.view.webview.postMessage(message)
        }
    }

    private async handleSendMessage(command: {
        contractAddress: string
        selectedMessage: string
        messageFields: Record<string, string>
        value: string
    }): Promise<void> {
        if (!command.contractAddress) {
            this.showResult(
                {
                    success: false,
                    message: "Please select a contract first",
                },
                "send-message-result",
            )
            return
        }

        if (!command.selectedMessage) {
            this.showResult(
                {
                    success: false,
                    message: "Please select a message first",
                },
                "send-message-result",
            )
            return
        }

        try {
            const messageBody = buildStructuredMessage(
                command.selectedMessage,
                command.messageFields,
                this,
                command.contractAddress,
            )

            const result = await sendMessage(command.contractAddress, messageBody, command.value)

            if (result.success) {
                this.showResult(
                    {
                        success: true,
                        message: `Message sent successfully to ${command.contractAddress}`,
                    },
                    "send-message-result",
                )
            } else {
                this.showResult(
                    {
                        success: false,
                        message: `Send failed: ${result.error ?? "Unknown error"}`,
                    },
                    "send-message-result",
                )
            }
        } catch (error) {
            this.showResult(
                {
                    success: false,
                    message: `Send failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                "send-message-result",
            )
        }
    }

    private async handleCallGetMethod(command: {
        contractAddress: string
        selectedMethod: string
        methodId: string
    }): Promise<void> {
        if (!command.contractAddress) {
            this.showResult(
                {
                    success: false,
                    message: "Please select a contract first",
                },
                "get-method-result",
            )
            return
        }

        if (!command.methodId) {
            this.showResult(
                {
                    success: false,
                    message: "Please enter method ID",
                },
                "get-method-result",
            )
            return
        }

        const methodId = Number.parseInt(command.methodId, 10)
        if (Number.isNaN(methodId)) {
            this.showResult(
                {
                    success: false,
                    message: "Method ID must be a valid number",
                },
                "get-method-result",
            )
            return
        }

        try {
            const result = await callGetMethod(command.contractAddress, methodId)

            if (result.success) {
                const message = `Method called successfully!\nResult: ${result.result ?? "No result"}`

                this.showResult(
                    {
                        success: true,
                        message,
                    },
                    "get-method-result",
                )
            } else {
                this.showResult(
                    {
                        success: false,
                        message: `Call failed: ${result.error ?? "Unknown error"}`,
                    },
                    "get-method-result",
                )
            }
        } catch (error) {
            this.showResult(
                {
                    success: false,
                    message: `Call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                "get-method-result",
            )
        }
    }

    private async handleLoadAbiForDeploy(): Promise<void> {
        const abi = await loadContractAbiForDeploy()
        if (abi) {
            this.updateContractAbi(abi)
        }
    }

    private async handleLoadContractInfo(contractAddress: string): Promise<void> {
        const info = await loadContractInfo(contractAddress)
        if (info.result) {
            this.updateContractInfo(info.result)
        }
    }

    private async handleCompileAndDeploy(
        name: string,
        storageFields: Record<string, string>,
        value?: string,
    ): Promise<void> {
        await compileAndDeployFromEditor(name, storageFields, this._treeProvider?.(), value)
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
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
