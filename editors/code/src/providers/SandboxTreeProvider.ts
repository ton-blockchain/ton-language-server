//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import {SandboxFormProvider} from "./SandboxFormProvider"
import {ContractAbi} from "@shared/abi"
import type {SandboxCodeLensProvider} from "./SandboxCodeLensProvider"
import {formatAddress} from "./methods"

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
        void this.checkSandboxStatus()
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

        this.codeLensProvider?.refresh()
    }

    public isContractDeployed(address: string): boolean {
        return this.deployedContracts.some(c => c.address === address)
    }

    public addDeployedContract(address: string, name?: string, abi?: ContractAbi): void {
        const existingIndex = this.deployedContracts.findIndex(c => c.address === address)

        if (existingIndex === -1) {
            const contractName = name ?? `Contract ${this.deployedContracts.length + 1}`
            this.deployedContracts.push({
                address,
                name: contractName,
                deployTime: new Date(),
                abi,
            })
        } else {
            const existingContract = this.deployedContracts[existingIndex]
            this.deployedContracts[existingIndex] = {
                ...existingContract,
                name: name ?? existingContract.name,
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
