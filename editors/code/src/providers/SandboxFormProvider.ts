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
    ContractInfoData,
} from "../webview-ui/src/types"
import {
    sendExternalMessage,
    sendInternalMessage,
    callGetMethod,
    buildStructuredMessage,
} from "../commands/sandboxCommands"
import {compileAndDeployFromEditor, loadContractAbiForDeploy, loadContractInfo} from "./methods"
import {Cell} from "@ton/core"
import {decompileCell} from "ton-assembly/dist/runtime"
import {print} from "ton-assembly/dist/text"
import {TolkSourceMap} from "./TolkCompilerProvider"

interface TransactionInfo {
    readonly vmLogs: string
    readonly code: string
    readonly contractName?: string
    readonly sourceMap?: TolkSourceMap
}

export class SandboxFormProvider implements vscode.WebviewViewProvider {
    public static readonly viewType: string = "tonSandboxForm"

    private view?: vscode.WebviewView
    public deployedContracts: {address: string; name: string; abi?: ContractAbi}[] = []

    private sequentialDebugQueue: TransactionInfo[] = []
    private isSequentialDebugRunning: boolean = false

    public constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _treeProvider?: () => import("./SandboxTreeProvider").SandboxTreeProvider,
        private readonly _statesProvider?: () => import("./StatesWebviewProvider").StatesWebviewProvider,
    ) {}

    private refreshStates(): void {
        if (this._statesProvider) {
            void this._statesProvider().handleLoadOperations()
        }
    }

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
                case "sendExternalMessage": {
                    void this.handleSendExternalMessage(command)
                    break
                }
                case "sendInternalMessage": {
                    void this.handleSendInternalMessage(command)
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
                case "showTransactionDetails": {
                    void vscode.commands.executeCommand("ton.transaction.showTransactionDetails", {
                        contractAddress: command.contractAddress,
                        methodName: command.methodName,
                        transactionId: command.transactionId,
                        timestamp: command.timestamp ?? new Date().toISOString(),
                    })
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

    public updateContractInfo(info: ContractInfoData): void {
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

    private async handleSendExternalMessage(command: {
        contractAddress: string
        selectedMessage: string
        messageFields: Record<string, string>
        autoDebug?: boolean
    }): Promise<void> {
        this.sequentialDebugQueue = []
        this.isSequentialDebugRunning = false
        if (!command.contractAddress) {
            this.showResult(
                {
                    success: false,
                    message: "Please select a contract first",
                },
                "send-external-message-result",
            )
            return
        }

        if (!command.selectedMessage) {
            this.showResult(
                {
                    success: false,
                    message: "Please select a message first",
                },
                "send-external-message-result",
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

            const result = await sendExternalMessage(command.contractAddress, messageBody)

            if (result.success) {
                this.showResult(
                    {
                        success: true,
                        message: `External message sent successfully to ${command.contractAddress}`,
                    },
                    "send-external-message-result",
                )
                this.refreshStates()

                if (command.autoDebug && result.txs.length > 0) {
                    const validTransactions = result.txs.map((tx, index) => {
                        const contract = this.deployedContracts.find(c => c.address === tx.addr)
                        const contractName = contract?.name ?? "UnknownContract"

                        return {
                            vmLogs: tx.vmLogs,
                            code: tx.code,
                            contractName: `${contractName}_TX_${index + 1}`,
                            sourceMap: tx.sourceMap,
                        }
                    })

                    if (validTransactions.length > 0) {
                        this.startSequentialDebugging(validTransactions)
                    }
                }
            } else {
                this.showResult(
                    {
                        success: false,
                        message: `External message send failed: ${result.error ?? "Unknown error"}`,
                    },
                    "send-external-message-result",
                )
            }
        } catch (error) {
            this.showResult(
                {
                    success: false,
                    message: `External message send failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                "send-external-message-result",
            )
        }
    }

    private async handleSendInternalMessage(command: {
        fromAddress: string
        toAddress: string
        selectedMessage: string
        messageFields: Record<string, string>
        sendMode: number
        value: string
        autoDebug?: boolean
    }): Promise<void> {
        this.sequentialDebugQueue = []
        this.isSequentialDebugRunning = false

        if (!command.fromAddress) {
            this.showResult(
                {
                    success: false,
                    message: "Please select source contract first",
                },
                "send-internal-message-result",
            )
            return
        }

        if (!command.toAddress) {
            this.showResult(
                {
                    success: false,
                    message: "Please select target contract first",
                },
                "send-internal-message-result",
            )
            return
        }

        if (!command.selectedMessage) {
            this.showResult(
                {
                    success: false,
                    message: "Please select a message first",
                },
                "send-internal-message-result",
            )
            return
        }

        try {
            const messageBody = buildStructuredMessage(
                command.selectedMessage,
                command.messageFields,
                this,
                command.toAddress,
            )

            const result = await sendInternalMessage(
                command.fromAddress,
                command.toAddress,
                messageBody,
                command.sendMode,
                command.value,
            )

            if (result.success) {
                this.showResult(
                    {
                        success: true,
                        message: "Internal message sent successfully",
                    },
                    "send-internal-message-result",
                )
                this.refreshStates()

                if (command.autoDebug && result.txs.length > 0) {
                    const validTransactions = result.txs.map((tx, index) => {
                        const contract = this.deployedContracts.find(c => c.address === tx.addr)
                        const contractName = contract?.name ?? "UnknownContract"

                        return {
                            vmLogs: tx.vmLogs,
                            code: tx.code,
                            contractName: `${contractName}_TX_${index + 1}`,
                            sourceMap: tx.sourceMap,
                        }
                    })

                    if (validTransactions.length > 0) {
                        console.log("txs:", validTransactions)
                        this.startSequentialDebugging(validTransactions)
                    }
                }
            } else {
                this.showResult(
                    {
                        success: false,
                        message: `Send failed: ${result.error ?? "Unknown error"}`,
                    },
                    "send-internal-message-result",
                )
            }
        } catch (error) {
            this.showResult(
                {
                    success: false,
                    message: `Send failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
                "send-internal-message-result",
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

    private startSequentialDebugging(transactions: TransactionInfo[]): void {
        if (this.isSequentialDebugRunning) {
            console.warn("Sequential debugging already running")
            return
        }

        this.sequentialDebugQueue = [...transactions]
        this.isSequentialDebugRunning = true

        console.log(
            `Starting sequential debugging for ${this.sequentialDebugQueue.length} transactions`,
        )
        void vscode.window.showInformationMessage(
            `Starting debug sequence for ${transactions.length} transactions`,
        )

        void this.processNextDebugSession()
    }

    private async processNextDebugSession(): Promise<void> {
        if (this.sequentialDebugQueue.length === 0) {
            console.log("Sequential debugging completed")
            this.isSequentialDebugRunning = false
            void vscode.window.showInformationMessage("Sequential debugging completed")
            return
        }

        const transaction = this.sequentialDebugQueue.shift()
        if (!transaction) {
            return
        }

        const remainingCount = this.sequentialDebugQueue.length
        const sessionNumber = remainingCount + 1

        console.log(
            `Starting debug session ${sessionNumber} for transaction (${remainingCount} remaining)`,
        )

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
            if (!workspaceFolder) {
                throw new Error("No workspace folder found")
            }

            const debugDirUri = vscode.Uri.joinPath(workspaceFolder.uri, ".debug")
            await vscode.workspace.fs.createDirectory(debugDirUri)

            const cell = Cell.fromHex(transaction.code)
            const instructions = decompileCell(cell)
            const assemblyCode = print(instructions)

            const contractName = transaction.contractName ?? `TX_${sessionNumber}`
            const fileName = `${contractName}.tasm`
            const fileUri = vscode.Uri.joinPath(debugDirUri, fileName)

            const assemblyCodeBuffer = Buffer.from(assemblyCode, "utf8")
            await vscode.workspace.fs.writeFile(fileUri, assemblyCodeBuffer)

            if (transaction.sourceMap === undefined) {
                // Show assembly only if source map is not available
                const doc = await vscode.workspace.openTextDocument(fileUri)
                await vscode.window.showTextDocument(doc, {
                    preview: false,
                    preserveFocus: false,
                })
            }

            const success = await vscode.debug.startDebugging(undefined, {
                type: "tolk",
                name: `Tolk Debug TX (${sessionNumber})`,
                request: "launch",
                code: transaction.code,
                vmLogs: transaction.vmLogs,
                program: fileUri.fsPath,
                sourceMap: transaction.sourceMap,
                assembly: assemblyCode,
                assemblyPath: fileUri.fsPath,
                stopOnEntry: true,
            })

            if (!success) {
                console.error(`Failed to start debug session ${sessionNumber}`)

                try {
                    await vscode.workspace.fs.delete(fileUri, {useTrash: false})
                    try {
                        await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
                    } catch (closeError) {
                        console.warn(`Failed to close tab for ${fileUri.fsPath}:`, closeError)
                    }
                } catch (cleanupError) {
                    console.warn(`Failed to clean up temp file after failed start:`, cleanupError)
                }

                void vscode.window.showWarningMessage(
                    `Failed to start debug session ${sessionNumber}, continuing with next...`,
                )
                void this.processNextDebugSession()
                return
            }

            console.log(`Debug session ${sessionNumber} started successfully`)

            const disposable = vscode.debug.onDidTerminateDebugSession(session => {
                if (session.name === `Tolk Debug TX (${sessionNumber})`) {
                    console.log(`Debug session ${sessionNumber} completed: ${session.name}`)
                    disposable.dispose()

                    vscode.workspace.fs.delete(fileUri, {useTrash: false}).then(
                        async () => {
                            console.log(`Cleaned up debug file: ${fileUri.fsPath}`)
                            try {
                                await vscode.commands.executeCommand(
                                    "workbench.action.closeActiveEditor",
                                )
                            } catch (closeError) {
                                console.warn(
                                    `Failed to close tab for ${fileUri.fsPath}:`,
                                    closeError,
                                )
                            }
                        },
                        (error: unknown) => {
                            console.warn(`Failed to clean up temp file ${fileUri.fsPath}:`, error)
                        },
                    )

                    if (remainingCount > 0) {
                        void vscode.window.showInformationMessage(
                            `Debug session ${sessionNumber} completed. Starting next session...`,
                        )
                    }

                    setTimeout(() => {
                        void this.processNextDebugSession()
                    }, 500)
                }
            })
        } catch (error) {
            console.error(`Error starting debug session ${sessionNumber}:`, error)
            void vscode.window.showErrorMessage(
                `Error in debug session ${sessionNumber}: ${error instanceof Error ? error.message : String(error)}`,
            )
            void this.processNextDebugSession()
        }
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
