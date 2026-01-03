//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as path from "node:path"

import * as vscode from "vscode"

import {Acton} from "../Acton"
import {BuildCommand, RunCommand, TestCommand} from "../ActonCommand"

export class ActonTomlCodeLensProvider implements vscode.CodeLensProvider {
    private readonly _onDidChangeCodeLenses: vscode.EventEmitter<void> =
        new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event

    public refresh(): void {
        this._onDidChangeCodeLenses.fire()
    }

    public provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken,
    ): vscode.CodeLens[] {
        if (!document.fileName.endsWith("Acton.toml")) {
            return []
        }

        const codeLenses: vscode.CodeLens[] = []
        const text = document.getText()
        const lines = text.split(/\r?\n/)

        let currentSection: string | null = null

        for (const [i, raw_line] of lines.entries()) {
            const line = raw_line.trim()
            if (line.startsWith("[") && line.endsWith("]")) {
                currentSection = line.slice(1, -1).trim()

                if (currentSection === "test") {
                    const range = new vscode.Range(i, 0, i, line.length)
                    codeLenses.push(
                        new vscode.CodeLens(range, {
                            title: "Run all tests",
                            command: "ton.acton.testAll",
                            arguments: [document.uri.fsPath],
                        }),
                    )
                }

                const contractMatch = /^contracts\.(.+)$/.exec(currentSection)
                if (contractMatch) {
                    const contractId = contractMatch[1].trim()
                    const range = new vscode.Range(i, 0, i, line.length)
                    codeLenses.push(
                        new vscode.CodeLens(range, {
                            title: "Build contract",
                            command: "ton.acton.buildContract",
                            arguments: [document.uri.fsPath, contractId],
                        }),
                    )
                }
            }
        }

        return codeLenses
    }

    public static registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand("ton.acton.testAll", async (tomlPath: string) => {
                const workingDir = path.dirname(tomlPath)
                await Acton.getInstance().execute(new TestCommand(), workingDir)
            }),
            vscode.commands.registerCommand(
                "ton.acton.buildContract",
                async (tomlPath: string, contractId: string) => {
                    const workingDir = path.dirname(tomlPath)
                    await Acton.getInstance().execute(new BuildCommand(contractId), workingDir)
                },
            ),
            vscode.commands.registerCommand(
                "ton.acton.runScript",
                async (tomlPath: string, scriptName: string) => {
                    const workingDir = path.dirname(tomlPath)
                    await Acton.getInstance().execute(new RunCommand(scriptName), workingDir)
                },
            ),
        )
    }
}
