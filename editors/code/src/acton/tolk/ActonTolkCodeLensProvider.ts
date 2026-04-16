//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as path from "node:path"

import * as vscode from "vscode"

import {Acton} from "../Acton"
import {ScriptCommand} from "../ActonCommand"

import {startActonScriptDebugging} from "./ActonScriptDebug"

const SCRIPT_BROADCAST_NETWORKS = [
    {
        label: "Testnet",
        description: "Broadcast to TON testnet",
        network: "testnet",
    },
    {
        label: "Mainnet",
        description: "Broadcast to TON mainnet",
        network: "mainnet",
    },
    {
        label: "Localnet",
        description: "Broadcast to localnet",
        network: "localnet",
    },
] as const

export class ActonTolkCodeLensProvider implements vscode.CodeLensProvider {
    public provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken,
    ): vscode.CodeLens[] {
        if (document.languageId !== "tolk" || document.uri.fsPath.endsWith(".test.tolk")) {
            return []
        }

        const lenses: vscode.CodeLens[] = []

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i)
            const text = line.text

            if (/fun\s+main\s*\(/i.test(text)) {
                const range = new vscode.Range(i, 0, i, text.length)
                lenses.push(
                    new vscode.CodeLens(range, {
                        title: "$(play) Emulate",
                        command: "ton.acton.run",
                        arguments: [document.uri],
                    }),
                    new vscode.CodeLens(range, {
                        title: "Debug",
                        command: "ton.acton.debugScript",
                        arguments: [document.uri],
                    }),
                    new vscode.CodeLens(range, {
                        title: "Broadcast",
                        command: "ton.acton.runBroadcast",
                        arguments: [document.uri],
                    }),
                )
            }
        }

        return lenses
    }

    public static registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand("ton.acton.run", async (fileUri: vscode.Uri) => {
                await ActonTolkCodeLensProvider.runScript(fileUri, "")
            }),
            vscode.commands.registerCommand(
                "ton.acton.debugScript",
                async (fileUri: vscode.Uri) => {
                    try {
                        await startActonScriptDebugging(fileUri)
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error)
                        void vscode.window.showErrorMessage(message)
                    }
                },
            ),
            vscode.commands.registerCommand(
                "ton.acton.runBroadcast",
                async (fileUri: vscode.Uri) => {
                    const broadcastNet = await vscode.window.showQuickPick(
                        SCRIPT_BROADCAST_NETWORKS,
                        {
                            placeHolder: "Select a network for acton script broadcast",
                            canPickMany: false,
                        },
                    )
                    if (!broadcastNet) {
                        return
                    }

                    await ActonTolkCodeLensProvider.runScript(fileUri, broadcastNet.network)
                },
            ),
        )
    }

    private static async runScript(fileUri: vscode.Uri, broadcastNet: string = ""): Promise<void> {
        const tomlUri = await Acton.getInstance().findActonToml(fileUri)
        const workingDir = tomlUri ? path.dirname(tomlUri.fsPath) : path.dirname(fileUri.fsPath)
        const scriptPath = path.relative(workingDir, fileUri.fsPath)

        const command = new ScriptCommand(scriptPath)
        command.broadcastNet = broadcastNet

        await Acton.getInstance().execute(command, workingDir)
    }
}
