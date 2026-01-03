//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as path from "node:path"

import * as vscode from "vscode"

import {Acton} from "./Acton"
import {TestCommand, TestMode} from "./ActonCommand"

export class ActonTestController implements Disposable {
    private readonly controller: vscode.TestController
    private readonly outputChannel: vscode.OutputChannel

    public constructor() {
        this.controller = vscode.tests.createTestController("actonTests", "Acton Tests")
        this.outputChannel = vscode.window.createOutputChannel("Acton Tests")

        this.controller.createRunProfile(
            "Run",
            vscode.TestRunProfileKind.Run,
            async (request, token) => {
                await this.runHandler(request, token)
            },
            true,
        )

        this.controller.resolveHandler = async item => {
            await (item ? this.discoverTestsInItem(item) : this.discoverAllTests())
        }

        vscode.workspace.onDidOpenTextDocument(e => {
            this.discoverTestsInDocument(e)
        })
        vscode.workspace.onDidChangeTextDocument(e => {
            this.discoverTestsInDocument(e.document)
        })

        const watcher = vscode.workspace.createFileSystemWatcher("**/*.test.tolk")
        watcher.onDidCreate(async uri => this.discoverTestsInFile(uri))
        watcher.onDidChange(async uri => this.discoverTestsInFile(uri))
        watcher.onDidDelete(uri => {
            this.controller.items.delete(uri.toString())
        })
    }

    private async discoverAllTests(): Promise<void> {
        const files = await vscode.workspace.findFiles("**/*.test.tolk")
        for (const file of files) {
            await this.discoverTestsInFile(file)
        }
    }

    private async discoverTestsInFile(uri: vscode.Uri): Promise<void> {
        try {
            if (uri.fsPath.includes(".acton")) {
                // skip tests in `.acton/`
                return
            }

            if (uri.fsPath.includes(".test.tolk.test.tolk")) {
                // skip temp artifacts
                return
            }

            const document = await vscode.workspace.openTextDocument(uri)
            this.discoverTestsInDocument(document)
        } catch (error) {
            console.error(`Failed to discover tests in ${uri.fsPath}`, error)
        }
    }

    private discoverTestsInDocument(document: vscode.TextDocument): void {
        if (!document.uri.fsPath.endsWith(".test.tolk")) {
            return
        }

        const fileItem = this.getOrCreateFile(document.uri)
        const text = document.getText()
        const testRegex = /get\s+fun\s+(`?test[\s_-][^(`]+`?)\s*\(/gi
        let match: RegExpExecArray | null

        const currentTestIds: Set<string> = new Set()

        while ((match = testRegex.exec(text)) !== null) {
            const name = match[1]
            const cleanName = name.startsWith("`") && name.endsWith("`") ? name.slice(1, -1) : name
            const id = `${document.uri.toString()}:${cleanName}`
            currentTestIds.add(id)

            let testItem = fileItem.children.get(id)
            if (!testItem) {
                testItem = this.controller.createTestItem(id, cleanName, document.uri)
                fileItem.children.add(testItem)
            }

            const startPos = document.positionAt(match.index)
            const endPos = document.positionAt(match.index + match[0].length)
            testItem.range = new vscode.Range(startPos, endPos)
        }

        fileItem.children.forEach(child => {
            if (!currentTestIds.has(child.id)) {
                fileItem.children.delete(child.id)
            }
        })

        if (fileItem.children.size === 0) {
            this.controller.items.delete(fileItem.id)
        }
    }

    private getOrCreateFile(uri: vscode.Uri): vscode.TestItem {
        const existing = this.controller.items.get(uri.toString())
        if (existing) {
            return existing
        }

        const fileItem = this.controller.createTestItem(
            uri.toString(),
            path.basename(uri.fsPath),
            uri,
        )
        fileItem.canResolveChildren = true
        this.controller.items.add(fileItem)
        return fileItem
    }

    private async discoverTestsInItem(item: vscode.TestItem): Promise<void> {
        if (item.uri && item.uri.fsPath.endsWith(".test.tolk")) {
            await this.discoverTestsInFile(item.uri)
        }
    }

    private async runHandler(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
    ): Promise<void> {
        const run = this.controller.createTestRun(request)
        const queue: vscode.TestItem[] = []

        if (request.include) {
            for (const test of request.include) {
                queue.push(test)
            }
        } else {
            this.controller.items.forEach(test => {
                queue.push(test)
            })
        }

        for (const test of queue) {
            if (token.isCancellationRequested) {
                break
            }

            await this.runTestItem(test, run, token)
        }

        run.end()
    }

    private async runTestItem(
        item: vscode.TestItem,
        run: vscode.TestRun,
        token: vscode.CancellationToken,
    ): Promise<void> {
        if (token.isCancellationRequested) {
            return
        }

        run.started(item)

        const uri = item.uri
        if (!uri) {
            run.skipped(item)
            return
        }

        const tomlUri = await Acton.getInstance().findActonToml(uri)
        const workingDir = tomlUri ? path.dirname(tomlUri.fsPath) : path.dirname(uri.fsPath)
        const relativePath = path.relative(workingDir, uri.fsPath)

        const command =
            item.children.size > 0
                ? new TestCommand(TestMode.FILE, relativePath)
                : new TestCommand(TestMode.FUNCTION, relativePath, item.label)

        try {
            const {exitCode, stdout, stderr} = await Acton.getInstance().spawn(
                command,
                workingDir,
                this.outputChannel,
                data => {
                    // Test runner output expects CRLF for newlines to be treated as a terminal
                    run.appendOutput(data.replace(/\r?\n/g, "\r\n"), undefined, item)
                },
            )

            if (exitCode === 0) {
                run.passed(item)
            } else {
                const rawMessage = stderr || stdout || "Test failed"

                // strip ANSI escape sequences from the output
                const cleanMessage = rawMessage.replace(
                    /[\u001B\u009B][#();?[]*(?:\d{1,4}(?:;\d{0,4})*)?[\d<=>A-ORZcf-nqry]/g,
                    "",
                )

                const displayMessage = this.extractErrorMessage(cleanMessage)
                const message = new vscode.TestMessage(displayMessage)

                message.location = this.extractErrorLocation(cleanMessage)

                run.failed(item, message)
            }
        } catch (error) {
            run.failed(item, new vscode.TestMessage(String(error)))
        }
    }

    private extractErrorLocation(cleanMessage: string): vscode.Location | undefined {
        const locationMatch = /at\s+(.+):(\d+):(\d+)/.exec(cleanMessage)
        if (!locationMatch) return undefined

        const filePath = locationMatch[1].trim()
        const line = Number.parseInt(locationMatch[2], 10)
        const column = Number.parseInt(locationMatch[3], 10)

        if (!Number.isNaN(line) && !Number.isNaN(column)) {
            return new vscode.Location(
                vscode.Uri.file(filePath),
                new vscode.Range(
                    new vscode.Position(line - 1, Math.max(0, column - 1)),
                    new vscode.Position(line - 1, column),
                ),
            )
        }

        return undefined
    }

    private extractErrorMessage(cleanMessage: string): string {
        const errorMatch = /Error:\s*(.+)/.exec(cleanMessage)
        if (errorMatch) {
            return errorMatch[1].trim()
        }
        return cleanMessage
    }

    public dispose(): void {
        this.controller.dispose()
        this.outputChannel.dispose()
    }

    public [Symbol.dispose](): void {
        this.dispose()
    }
}
