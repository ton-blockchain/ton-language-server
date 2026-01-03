//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as path from "node:path"

import * as vscode from "vscode"

import {Acton} from "../Acton"
import {ScriptCommand} from "../ActonCommand"

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
                await ActonTolkCodeLensProvider.runScript(fileUri, false)
            }),
            vscode.commands.registerCommand(
                "ton.acton.runBroadcast",
                async (fileUri: vscode.Uri) => {
                    await ActonTolkCodeLensProvider.runScript(fileUri, true)
                },
            ),
        )
    }

    private static async runScript(fileUri: vscode.Uri, broadcast: boolean): Promise<void> {
        const tomlUri = await Acton.getInstance().findActonToml(fileUri)
        const workingDir = tomlUri ? path.dirname(tomlUri.fsPath) : path.dirname(fileUri.fsPath)
        const scriptPath = path.relative(workingDir, fileUri.fsPath)

        const command = new ScriptCommand(scriptPath)
        command.broadcast = broadcast

        await Acton.getInstance().execute(command, workingDir)
    }
}
