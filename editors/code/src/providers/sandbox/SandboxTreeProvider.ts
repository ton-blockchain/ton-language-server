//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as child_process from "node:child_process"

import * as vscode from "vscode"

import {SourceMap} from "ton-source-map"

import {ContractAbi} from "@shared/abi"

import {DeployedContract} from "../../common/types/contract"
import {formatAddress} from "../../common/format"
import {MessageTemplate} from "../../webview-ui/src/views/actions/sandbox-actions-types"

import {SandboxActionsProvider} from "./SandboxActionsProvider"
import type {SandboxCodeLensProvider} from "./SandboxCodeLensProvider"
import {checkSandboxStatus, getContracts, getMessageTemplates} from "./methods"

interface SandboxTreeItem {
    readonly id: string
    readonly label: string
    readonly description?: string
    readonly contextValue?: string
    readonly iconPath?: vscode.ThemeIcon
    readonly collapsibleState?: vscode.TreeItemCollapsibleState
    readonly command?: vscode.Command
}

export class SandboxTreeProvider implements vscode.TreeDataProvider<SandboxTreeItem> {
    private readonly _onDidChangeTreeData: vscode.EventEmitter<SandboxTreeItem | undefined | null> =
        new vscode.EventEmitter<SandboxTreeItem | undefined | null>()
    public readonly onDidChangeTreeData: vscode.Event<SandboxTreeItem | undefined | null> =
        this._onDidChangeTreeData.event

    private deployedContracts: DeployedContract[] = []
    private sandboxStatus: "disconnected" | "connected" | "server-not-found" | "error" =
        "disconnected"
    private messageTemplates: MessageTemplate[] = []
    private actionsProvider?: SandboxActionsProvider
    private codeLensProvider?: SandboxCodeLensProvider

    public constructor() {
        void this.checkSandboxStatus(true)
    }

    public setActionsProvider(formProvider: SandboxActionsProvider): void {
        this.actionsProvider = formProvider
        this.updateFormContracts()
    }

    public setCodeLensProvider(codeLensProvider: SandboxCodeLensProvider): void {
        this.codeLensProvider = codeLensProvider
    }

    public refresh(loadContracts: boolean = false): void {
        this._onDidChangeTreeData.fire(undefined)
        void this.checkSandboxStatus(loadContracts)
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
            case "message-templates": {
                return Promise.resolve(this.getMessageTemplateItems())
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
        const isServerAvailable = this.isSandboxServerAvailable()

        items.push({
            id: "status",
            label: "Sandbox Status",
            description: this.getStatusDescription(),
            iconPath: this.getStatusIcon(),
            contextValue: "sandbox-status",
            collapsibleState: vscode.TreeItemCollapsibleState.None,
        })

        if (!isServerAvailable) {
            items.push({
                id: "install-server",
                label: "Install TON Sandbox Server",
                description: "Click to install via NPM",
                iconPath: new vscode.ThemeIcon("cloud-download"),
                contextValue: "install-server",
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: "ton.sandbox.installServer",
                    title: "Install TON Sandbox Server",
                },
            })
            return items
        }

        items.push(
            {
                id: "contracts",
                label: "Deployed Contracts",
                description: `${this.deployedContracts.length} contracts`,
                iconPath: new vscode.ThemeIcon("package"),
                contextValue: "contracts-section",
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
            },
            {
                id: "message-templates",
                label: "Message Templates",
                description: `${this.messageTemplates.length} template${this.messageTemplates.length === 1 ? "" : "s"}`,
                iconPath: new vscode.ThemeIcon("file-text"),
                contextValue: "message-templates-section",
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
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

    private isSandboxServerAvailable(): boolean {
        try {
            const command = process.platform === "win32" ? "where" : "which"
            const result = child_process.spawnSync(command, ["ton-sandbox-server"], {
                stdio: "pipe",
                encoding: "utf8",
            })
            return result.status === 0
        } catch {
            return false
        }
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
            description: formatAddress(contract.address),
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

    private getMessageTemplateItems(): SandboxTreeItem[] {
        if (this.messageTemplates.length === 0) {
            return [
                {
                    id: "no-templates",
                    label: "No message templates",
                    iconPath: new vscode.ThemeIcon("info"),
                    contextValue: "no-templates",
                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                },
            ]
        }

        return this.messageTemplates.map(template => ({
            id: `template-${template.id}`,
            label: template.name,
            description: template.description,
            iconPath: new vscode.ThemeIcon("file-text"),
            contextValue: "message-template",
            collapsibleState: vscode.TreeItemCollapsibleState.None,
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
                const config = vscode.workspace.getConfiguration("ton")
                const port = config.get<number>("sandbox.port", 3000)
                return `Connected to port ${port}`
            }
            case "error": {
                return "Connection Error"
            }
            case "server-not-found": {
                return "Need to start sandbox-server"
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
            case "server-not-found": {
                return new vscode.ThemeIcon(
                    "circle-outline",
                    new vscode.ThemeColor("testing.iconQueued"),
                )
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

    private async checkSandboxStatus(loadContracts: boolean): Promise<void> {
        if (!this.isSandboxServerAvailable()) {
            this.sandboxStatus = "server-not-found"
            this._onDidChangeTreeData.fire(undefined)
            this.codeLensProvider?.refresh()
            return
        }

        try {
            const result = await checkSandboxStatus()

            console.log(result)

            this.sandboxStatus = result.success
                ? "connected"
                : result.error === "fetch failed"
                  ? "server-not-found"
                  : "error"

            const isConnected = this.sandboxStatus === "connected"
            this.actionsProvider?.updateConnectionStatus(isConnected)

            if (this.sandboxStatus === "connected" && loadContracts) {
                await this.loadContractsFromServer()
                await this.loadMessageTemplatesFromServer()
            }
        } catch {
            this.sandboxStatus = "disconnected"
        }
        this._onDidChangeTreeData.fire(undefined)

        this.codeLensProvider?.refresh()
    }

    public async loadContractsFromServer(): Promise<void> {
        try {
            const result = await getContracts()
            if (!result.success) {
                console.warn("Failed to load contracts from server:", result.error)
                return
            }

            const serverAddresses = new Set(result.data.contracts.map(c => c.address))
            const existingContracts = this.deployedContracts.filter(
                c => !serverAddresses.has(c.address),
            )

            const serverContracts: DeployedContract[] = result.data.contracts.map(c => ({
                ...c,
                deployTime: new Date(),
            }))

            this.deployedContracts = [...existingContracts, ...serverContracts]

            this.refresh()
            this.updateFormContracts()
        } catch (error) {
            console.warn("Error loading contracts from server:", error)
        }
    }

    public async loadMessageTemplatesFromServer(): Promise<void> {
        try {
            const result = await getMessageTemplates()
            if (!result.success) {
                console.warn("Failed to load message templates from server:", result.error)
                return
            }

            this.messageTemplates = result.data.templates
            this.refresh()
        } catch (error) {
            console.warn("Error loading message templates from server:", error)
        }
    }

    public isContractDeployed(address: string): boolean {
        return this.deployedContracts.some(c => c.address === address)
    }

    public addDeployedContract(
        address: string,
        name: string,
        abi: ContractAbi | undefined,
        sourceMap: SourceMap | undefined,
        sourceUri: string,
    ): void {
        const existingIndex = this.deployedContracts.findIndex(c => c.address === address)

        if (existingIndex === -1) {
            this.deployedContracts.push({
                address,
                name,
                deployTime: new Date(),
                abi,
                sourceUri,
                sourceMap,
            })
        } else {
            const existingContract = this.deployedContracts[existingIndex]
            this.deployedContracts[existingIndex] = {
                ...existingContract,
                name,
                deployTime: new Date(),
                abi: abi ?? existingContract.abi,
            }
        }

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

    public updateSandboxStatus(status: "connected" | "disconnected" | "error"): void {
        this.sandboxStatus = status
        this.refresh()
    }

    public getDeployedContracts(): readonly DeployedContract[] {
        return [...this.deployedContracts]
    }

    private updateFormContracts(): void {
        if (this.actionsProvider) {
            this.actionsProvider.updateContracts(this.deployedContracts)
        }
    }

    public addMessageTemplate(template: MessageTemplate): void {
        const existingIndex = this.messageTemplates.findIndex(t => t.id === template.id)

        if (existingIndex === -1) {
            this.messageTemplates.push(template)
        } else {
            this.messageTemplates[existingIndex] = template
        }

        this.refresh()
    }

    public removeMessageTemplate(id: string): void {
        this.messageTemplates = this.messageTemplates.filter(t => t.id !== id)
        this.refresh()
    }

    public getMessageTemplates(): readonly MessageTemplate[] {
        return [...this.messageTemplates]
    }

    public getSandboxStatus(): "disconnected" | "connected" | "server-not-found" | "error" {
        return this.sandboxStatus
    }
}
