//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import {TolkCompilerProvider} from "./TolkCompilerProvider"
import {SandboxFormProvider} from "./SandboxFormProvider"
import {GetContractAbiParams, GetContractAbiResponse} from "@shared/shared-msgtypes"
import {ContractAbi, Field} from "@shared/abi"
import {beginCell} from "@ton/core"
import type {SandboxCodeLensProvider} from "./SandboxCodeLensProvider"

interface SandboxTreeItem {
    readonly id: string
    readonly label: string
    readonly description?: string
    readonly contextValue?: string
    readonly iconPath?: vscode.ThemeIcon
    readonly collapsibleState?: vscode.TreeItemCollapsibleState
    readonly command?: vscode.Command
}

interface DeployedContract {
    readonly address: string
    readonly name: string
    readonly deployTime: Date
    readonly abi?: ContractAbi
}

export class SandboxTreeProvider implements vscode.TreeDataProvider<SandboxTreeItem> {
    private readonly _onDidChangeTreeData: vscode.EventEmitter<SandboxTreeItem | undefined | null> =
        new vscode.EventEmitter<SandboxTreeItem | undefined | null>()
    public readonly onDidChangeTreeData: vscode.Event<SandboxTreeItem | undefined | null> =
        this._onDidChangeTreeData.event

    private deployedContracts: DeployedContract[] = []
    private sandboxStatus: "disconnected" | "connected" | "error" = "disconnected"
    private formProvider?: SandboxFormProvider
    private codeLensProvider?: SandboxCodeLensProvider

    public constructor() {
        void this.checkSandboxStatus()
    }

    public setFormProvider(formProvider: SandboxFormProvider): void {
        this.formProvider = formProvider
        this.updateFormContracts()
    }

    public setCodeLensProvider(codeLensProvider: SandboxCodeLensProvider): void {
        this.codeLensProvider = codeLensProvider
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined)
    }

    public getTreeItem(element: SandboxTreeItem): vscode.TreeItem {
        const item = new vscode.TreeItem(element.label, element.collapsibleState)
        item.id = element.id
        item.description = element.description
        item.contextValue = element.contextValue
        item.iconPath = element.iconPath
        item.command = element.command
        return item
    }

    public getChildren(element?: SandboxTreeItem): Thenable<SandboxTreeItem[]> {
        if (!element) {
            return Promise.resolve(this.getRootItems())
        }

        switch (element.id) {
            case "contracts": {
                return Promise.resolve(this.getContractItems())
            }
            case "actions": {
                return Promise.resolve(this.getActionItems())
            }
            default: {
                return Promise.resolve([])
            }
        }
    }

    private getRootItems(): SandboxTreeItem[] {
        const items: SandboxTreeItem[] = []

        items.push(
            {
                id: "status",
                label: "Sandbox Status",
                description: this.getStatusDescription(),
                iconPath: this.getStatusIcon(),
                contextValue: "sandbox-status",
                collapsibleState: vscode.TreeItemCollapsibleState.None,
            },
            {
                id: "contracts",
                label: "Deployed Contracts",
                description: `${this.deployedContracts.length} contracts`,
                iconPath: new vscode.ThemeIcon("package"),
                contextValue: "contracts-section",
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
            },
            {
                id: "actions",
                label: "Actions",
                iconPath: new vscode.ThemeIcon("play"),
                contextValue: "actions-section",
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
            },
        )

        return items
    }

    private getContractItems(): SandboxTreeItem[] {
        if (this.deployedContracts.length === 0) {
            return [
                {
                    id: "no-contracts",
                    label: "No contracts deployed",
                    iconPath: new vscode.ThemeIcon("info"),
                    contextValue: "no-contracts",
                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                },
            ]
        }

        return this.deployedContracts.map(contract => ({
            id: `contract-${contract.address}`,
            label: contract.name,
            description: this.formatAddress(contract.address),
            iconPath: new vscode.ThemeIcon("symbol-class"),
            contextValue: "deployed-contract",
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            command: {
                command: "ton.sandbox.openContractInfo",
                title: "Open Contract Information",
                arguments: [contract.address],
            },
        }))
    }

    private getActionItems(): SandboxTreeItem[] {
        return [
            {
                id: "compile-deploy",
                label: "Compile & Deploy",
                description: "From active editor",
                iconPath: new vscode.ThemeIcon("rocket"),
                contextValue: "action-compile-deploy",
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: "ton.sandbox.openOperation",
                    title: "Open Compile & Deploy",
                    arguments: ["compile-deploy"],
                },
            },
            {
                id: "send-message",
                label: "Send Message",
                iconPath: new vscode.ThemeIcon("mail"),
                contextValue: "action-send-message",
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: "ton.sandbox.openOperation",
                    title: "Open Send Message",
                    arguments: ["send-message"],
                },
            },
            {
                id: "call-get-method",
                label: "Call Get Method",
                iconPath: new vscode.ThemeIcon("symbol-method"),
                contextValue: "action-call-get-method",
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: "ton.sandbox.openOperation",
                    title: "Open Call Get Method",
                    arguments: ["get-method"],
                },
            },
        ]
    }

    private getStatusDescription(): string {
        switch (this.sandboxStatus) {
            case "connected": {
                return "Connected"
            }
            case "error": {
                return "Connection Error"
            }
            case "disconnected": {
                return "Disconnected"
            }
            default: {
                return "Unknown"
            }
        }
    }

    private getStatusIcon(): vscode.ThemeIcon {
        switch (this.sandboxStatus) {
            case "connected": {
                return new vscode.ThemeIcon("check", new vscode.ThemeColor("testing.iconPassed"))
            }
            case "error": {
                return new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"))
            }
            case "disconnected": {
                return new vscode.ThemeIcon(
                    "circle-outline",
                    new vscode.ThemeColor("testing.iconQueued"),
                )
            }
            default: {
                return new vscode.ThemeIcon(
                    "circle-outline",
                    new vscode.ThemeColor("testing.iconQueued"),
                )
            }
        }
    }

    private formatAddress(address: string): string {
        if (address.length <= 12) {
            return address
        }
        return `${address.slice(0, 6)}...${address.slice(Math.max(0, address.length - 6))}`
    }

    private async checkSandboxStatus(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration("ton")
            const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

            const response = await fetch(`${sandboxUrl}/health`, {
                method: "GET",
                signal: AbortSignal.timeout(5000),
            })

            this.sandboxStatus = response.ok ? "connected" : "error"
        } catch {
            this.sandboxStatus = "disconnected"
        }

        this.refresh()
    }

    public addDeployedContract(address: string, name?: string, abi?: ContractAbi): void {
        const contractName = name ?? `Contract ${this.deployedContracts.length + 1}`
        this.deployedContracts.push({
            address,
            name: contractName,
            deployTime: new Date(),
            abi,
        })
        this.refresh()
        this.updateFormContracts()
        this.codeLensProvider?.refresh()
    }

    public removeContract(address: string): void {
        this.deployedContracts = this.deployedContracts.filter(c => c.address !== address)
        this.refresh()
        this.updateFormContracts()
        this.codeLensProvider?.refresh()
    }

    public clearContracts(): void {
        this.deployedContracts = []
        this.refresh()
        this.updateFormContracts()
        this.codeLensProvider?.refresh()
    }

    public updateSandboxStatus(status: "connected" | "disconnected" | "error"): void {
        this.sandboxStatus = status
        this.refresh()
    }

    public getDeployedContracts(): readonly DeployedContract[] {
        return [...this.deployedContracts]
    }

    public async loadContractAbiForDeploy(): Promise<void> {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            void vscode.window.showErrorMessage("No active editor with contract code")
            return
        }

        if (editor.document.languageId !== "tolk") {
            void vscode.window.showErrorMessage("Active file is not a Tolk contract")
            return
        }

        const abiResult: GetContractAbiResponse = await vscode.commands.executeCommand(
            "tolk.getContractAbi",
            {
                textDocument: {
                    uri: editor.document.uri.toString(),
                },
            } satisfies GetContractAbiParams,
        )

        const contractAbi = abiResult.abi

        if (this.formProvider && contractAbi) {
            this.formProvider.updateStorageFields(contractAbi)
        }
    }

    public async loadContractInfo(address: string): Promise<void> {
        const info = await this.loadContractInfoImpl(address)
        if (info.result) {
            this.formProvider?.updateContractInfo(info.result)
        }
    }

    public async loadContractInfoImpl(address: string): Promise<{
        success: boolean
        result?: {account: string}
        error?: string
    }> {
        try {
            const config = vscode.workspace.getConfiguration("ton")
            const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

            const response = await fetch(`${sandboxUrl}/info`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    address,
                }),
            })

            if (!response.ok) {
                throw new Error(`API call failed: ${response.status} ${response.statusText}`)
            }

            return (await response.json()) as {
                success: boolean
                result?: {account: string}
                error?: string
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }
        }
    }

    public async compileAndDeployFromEditor(storageFields?: Record<string, string>): Promise<void> {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            void vscode.window.showErrorMessage("No active editor with contract code")
            return
        }

        if (editor.document.languageId !== "tolk") {
            void vscode.window.showErrorMessage("Active file is not a Tolk contract")
            return
        }

        const abiResult: GetContractAbiResponse = await vscode.commands.executeCommand(
            "tolk.getContractAbi",
            {
                textDocument: {
                    uri: editor.document.uri.toString(),
                },
            } satisfies GetContractAbiParams,
        )

        const contractAbi = abiResult.abi

        try {
            const compiler = TolkCompilerProvider.getInstance()
            const result = await compiler.compileContract(editor.document.getText())

            if (!result.success) {
                void vscode.window.showErrorMessage(`Compilation failed: ${result.error}`)
                return
            }

            if (!result.code) {
                void vscode.window.showErrorMessage("Compilation succeeded but no code generated")
                return
            }

            let initialData: string | undefined
            if (
                storageFields &&
                contractAbi?.storage?.fields &&
                Object.keys(storageFields).length > 0
            ) {
                try {
                    initialData = await this.buildInitialData(
                        contractAbi.storage.fields,
                        storageFields,
                    )
                } catch (error) {
                    void vscode.window.showErrorMessage(
                        `Failed to build initial data: ${error instanceof Error ? error.message : "Unknown error"}`,
                    )
                    return
                }
            }

            const deployResult = await this.deployContract({
                code: result.code,
                data: initialData ?? "",
            })
            if (deployResult.success && deployResult.address) {
                const contractName = this.getContractNameFromDocument(editor.document)
                this.addDeployedContract(deployResult.address, contractName, contractAbi)
                void vscode.window.showInformationMessage(
                    `Contract deployed successfully! Address: ${this.formatAddress(deployResult.address)}`,
                )
            } else {
                void vscode.window.showErrorMessage(`Deploy failed: ${deployResult.error}`)
            }
        } catch (error) {
            void vscode.window.showErrorMessage(
                `Operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            )
        }
    }

    private getContractNameFromDocument(document: vscode.TextDocument): string {
        const fileName = document.fileName
        const baseName = fileName.split("/").pop() ?? "Unknown"
        return baseName.replace(/\.(tolk|fc|func)$/, "")
    }

    private async buildInitialData(
        storageFields: readonly Field[],
        fieldValues: Record<string, string>,
    ): Promise<string> {
        const builder = beginCell()

        for (const field of storageFields) {
            const fieldValue = fieldValues[field.name]
            if (!fieldValue) {
                continue
            }

            const fieldTypeInfo = this.parseFieldTypeFromAbi(field.type)
            if (!fieldTypeInfo) {
                continue
            }

            try {
                switch (fieldTypeInfo.type) {
                    case "uint": {
                        const value = BigInt(fieldValue)
                        builder.storeUint(value, fieldTypeInfo.bits)
                        break
                    }
                    case "int": {
                        const value = BigInt(fieldValue)
                        builder.storeInt(value, fieldTypeInfo.bits)
                        break
                    }
                    case "bool": {
                        const value = fieldValue.toLowerCase() === "true" || fieldValue === "1"
                        builder.storeBit(value)
                        break
                    }
                    case "varuint": {
                        const value = BigInt(fieldValue)
                        builder.storeVarUint(value, fieldTypeInfo.maxBytes)
                        break
                    }
                    case "varint": {
                        const value = BigInt(fieldValue)
                        builder.storeVarInt(value, fieldTypeInfo.maxBytes)
                        break
                    }
                    case "cell": {
                        const {Cell} = await import("@ton/core")
                        const cellValue = Cell.fromBase64(fieldValue)
                        builder.storeRef(cellValue)
                        break
                    }
                    default: {
                        // TODO
                        break
                    }
                }
            } catch (error) {
                throw new Error(
                    `Failed to encode storage field ${field.name} (${field.type}) with value ${fieldValue}: ${error instanceof Error ? error.message : "Unknown error"}`,
                )
            }
        }

        const cell = builder.endCell()
        return cell.toBoc().toString("base64")
    }

    private parseFieldTypeFromAbi(abiType: string):
        | {
              type: string
              bits: number
              maxBytes: number
          }
        | undefined {
        const lowerAbiType = abiType.toLowerCase()

        if (lowerAbiType === "bool") {
            return {type: "bool", bits: 1, maxBytes: 1}
        }

        const uintMatch = /^uint(\d+)$/.exec(lowerAbiType)
        if (uintMatch) {
            const bits = Number.parseInt(uintMatch[1], 10)
            return {type: "uint", bits, maxBytes: 0}
        }

        const intMatch = /^int(\d+)$/.exec(lowerAbiType)
        if (intMatch) {
            const bits = Number.parseInt(intMatch[1], 10)
            return {type: "int", bits, maxBytes: 0}
        }

        const varuintMatch = /^varuint(\d+)$/.exec(lowerAbiType)
        if (varuintMatch) {
            const maxBits = Number.parseInt(varuintMatch[1], 10)
            const maxBytes = Math.ceil(maxBits / 8)
            return {type: "varuint", bits: 0, maxBytes}
        }

        const varintMatch = /^varint(\d+)$/.exec(lowerAbiType)
        if (varintMatch) {
            const maxBits = Number.parseInt(varintMatch[1], 10)
            const maxBytes = Math.ceil(maxBits / 8)
            return {type: "varint", bits: 0, maxBytes}
        }

        if (lowerAbiType === "cell") {
            return {type: "cell", bits: 0, maxBytes: 0}
        }

        return undefined
    }

    private async deployContract(stateInit: {code: string; data: string}): Promise<{
        success: boolean
        address?: string
        error?: string
    }> {
        try {
            const config = vscode.workspace.getConfiguration("ton")
            const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

            const response = await fetch(`${sandboxUrl}/deploy`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    stateInit,
                }),
            })

            if (!response.ok) {
                throw new Error(`API call failed: ${response.status} ${response.statusText}`)
            }

            return (await response.json()) as {success: boolean; address?: string; error?: string}
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }
        }
    }

    private updateFormContracts(): void {
        if (this.formProvider) {
            this.formProvider.updateContracts(
                this.deployedContracts.map(c => ({
                    address: c.address,
                    name: c.name,
                    abi: c.abi,
                })),
            )
        }
    }
}
