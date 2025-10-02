//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"

import {Event} from "vscode"

import {GetMethod, EntryPoint} from "@shared/abi"
import {GetContractAbiParams, GetContractAbiResponse} from "@shared/shared-msgtypes"

import {DeployedContract} from "../../common/types/contract"

import {formatAddress} from "../../common/format"

import {SandboxTreeProvider} from "./SandboxTreeProvider"

export class SandboxCodeLensProvider implements vscode.CodeLensProvider {
    private readonly _onDidChangeCodeLenses: vscode.EventEmitter<void> =
        new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: Event<void> = this._onDidChangeCodeLenses.event

    public constructor(private readonly treeProvider: SandboxTreeProvider) {}

    public refresh(): void {
        this._onDidChangeCodeLenses.fire()
    }

    public async provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken,
    ): Promise<vscode.CodeLens[]> {
        if (document.languageId !== "tolk") {
            return []
        }

        try {
            const abiResult: GetContractAbiResponse = await vscode.commands.executeCommand(
                "tolk.getContractAbi",
                {
                    textDocument: {
                        uri: document.uri.toString(),
                    },
                } satisfies GetContractAbiParams,
            )

            if (!abiResult.abi) {
                return []
            }

            const codeLenses: vscode.CodeLens[] = []
            const contractAbi = abiResult.abi

            if (contractAbi.entryPoint?.pos) {
                const entryPointLens = this.createEntryPointCodeLens(
                    contractAbi.entryPoint,
                    document,
                )
                if (entryPointLens) {
                    codeLenses.push(...entryPointLens)
                }
            }

            for (const getMethod of contractAbi.getMethods) {
                if (getMethod.pos) {
                    const methodLens = this.createGetMethodCodeLens(getMethod, document)
                    if (methodLens) {
                        codeLenses.push(methodLens)
                    }
                }
            }

            return codeLenses
        } catch (error) {
            console.error("Error providing CodeLenses:", error)
            return []
        }
    }

    private createEntryPointCodeLens(
        entryPoint: EntryPoint,
        document: vscode.TextDocument,
    ): vscode.CodeLens[] | null {
        if (!entryPoint.pos) {
            return null
        }

        const position = new vscode.Position(entryPoint.pos.row, entryPoint.pos.column)
        const range = new vscode.Range(position, position)

        const codeLenses: vscode.CodeLens[] = []

        const deployedContract = this.findDeployedContract(document)

        if (deployedContract) {
            const statusLens = new vscode.CodeLens(range, {
                title: `Deployed: ${formatAddress(deployedContract.address)}`,
                command: "ton.sandbox.copyContractAddress",
                arguments: [deployedContract.address],
            })

            const sendMessageLens = new vscode.CodeLens(range, {
                title: "Send Message",
                command: "ton.sandbox.openContractSendMessage",
                arguments: [deployedContract.address],
            })

            const redeployLens = new vscode.CodeLens(range, {
                title: "Redeploy",
                command: "ton.sandbox.redeployContract",
                arguments: [deployedContract],
            })

            codeLenses.push(statusLens, sendMessageLens, redeployLens)
        } else {
            const deployLens = new vscode.CodeLens(range, {
                title: "Deploy contract",
                command: "ton.sandbox.deployFromCodeLens",
                arguments: [],
            })

            codeLenses.push(deployLens)
        }

        return codeLenses
    }

    private createGetMethodCodeLens(
        getMethod: GetMethod,
        document: vscode.TextDocument,
    ): vscode.CodeLens | null {
        if (!getMethod.pos) {
            return null
        }

        const position = new vscode.Position(getMethod.pos.row, getMethod.pos.column)
        const range = new vscode.Range(position, position)

        const deployedContract = this.findDeployedContract(document)

        if (deployedContract) {
            return new vscode.CodeLens(range, {
                title: `Execute get method`,
                command: "ton.sandbox.callGetMethodFromCodeLens",
                arguments: [deployedContract, getMethod.id],
            })
        }

        return null
    }

    private findDeployedContract(document: vscode.TextDocument): DeployedContract | undefined {
        const deployedContracts = this.treeProvider.getDeployedContracts()
        return deployedContracts.find(c => c.sourceUri === document.uri.toString())
    }
}
