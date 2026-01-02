//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {join} from "node:path"

import {spawn} from "node:child_process"

import * as vscode from "vscode"

import {Disposable} from "vscode"

import {GetMethod} from "@shared/abi"
import {GetContractAbiParams, GetContractAbiResponse} from "@shared/shared-msgtypes"

export class TolkTestController implements Disposable {
    public readonly controller: vscode.TestController
    private readonly testItems: Map<string, vscode.TestItem> = new Map()
    private testsDiscovered: boolean = false

    public constructor() {
        this.controller = vscode.tests.createTestController("tolkTests", "Tolk Tests")
        this.controller.refreshHandler = async () => {
            await this.refresh()
        }
        this.controller.resolveHandler = async item => {
            await this.resolve(item)
        }
        this.controller.createRunProfile(
            "Run Tests",
            vscode.TestRunProfileKind.Run,
            async (request, token) => {
                await this.runTests(request, token)
            },
            true,
        )

        this.controller.createRunProfile(
            "Debug Tests",
            vscode.TestRunProfileKind.Debug,
            async (request, token) => {
                await this.debugTests(request, token)
            },
            false,
        )

        // Watch for file changes to update tests
        const watcher = vscode.workspace.createFileSystemWatcher("**/*.tolk")
        watcher.onDidChange(async uri => {
            await this.onFileChange(uri)
        })
        watcher.onDidCreate(async uri => {
            await this.onFileChange(uri)
        })
        watcher.onDidDelete(uri => {
            this.onFileDelete(uri)
        })
    }

    private async onFileChange(uri: vscode.Uri): Promise<void> {
        await this.updateTestsForFile(uri)
    }

    private onFileDelete(uri: vscode.Uri): void {
        const fileId = uri.toString()
        const testsToRemove = [...this.testItems.entries()].filter(
            ([, testItem]) => testItem.uri?.toString() === fileId,
        )

        for (const [testId, testItem] of testsToRemove) {
            this.controller.items.delete(testItem.id)
            this.testItems.delete(testId)
        }
    }

    private async refresh(): Promise<void> {
        this.testsDiscovered = false
        await this.discoverAllTests()
    }

    private async resolve(item: vscode.TestItem | undefined): Promise<void> {
        if (!item) {
            if (!this.testsDiscovered) {
                await this.discoverAllTests()
            }
            return
        }

        if (item.uri) {
            await this.updateTestsForFile(item.uri)
        }
    }

    private async discoverAllTests(): Promise<void> {
        this.controller.items.forEach(item => {
            this.controller.items.delete(item.id)
        })
        this.testItems.clear()

        const tolkFiles = await vscode.workspace.findFiles("**/*.test.tolk", "**/node_modules/**")
        const files = [...tolkFiles]

        for (const uri of files) {
            if (
                uri.fsPath.includes(".test.tolk.test.tolk") ||
                uri.fsPath.includes("node_modules")
            ) {
                continue
            }
            await this.updateTestsForFile(uri)
        }

        this.testsDiscovered = true
    }

    private async updateTestsForFile(uri: vscode.Uri): Promise<void> {
        try {
            const abiResult: GetContractAbiResponse = await vscode.commands.executeCommand(
                "tolk.getContractAbi",
                {
                    textDocument: {
                        uri: uri.toString(),
                    },
                } satisfies GetContractAbiParams,
            )

            if (!abiResult.abi) {
                return
            }

            const contractAbi = abiResult.abi
            const fileId = uri.toString()

            const existingTests = [...this.testItems.entries()].filter(
                ([, testItem]) => testItem.uri?.toString() === fileId,
            )

            for (const [testId] of existingTests) {
                const testItem = this.testItems.get(testId)
                if (testItem) {
                    this.controller.items.delete(testItem.id)
                }
                this.testItems.delete(testId)
            }

            for (const getMethod of contractAbi.getMethods) {
                if (this.isTestMethod(getMethod)) {
                    this.createTestItem(getMethod, uri)
                }
            }
        } catch (error) {
            console.error("Error updating tests for file:", error)
        }
    }

    private isTestMethod(getMethod: GetMethod): boolean {
        return (
            getMethod.name.startsWith("test ") ||
            getMethod.name.startsWith("test_") ||
            getMethod.name.startsWith("test-")
        )
    }

    private createTestItem(getMethod: GetMethod, uri: vscode.Uri): void {
        const testId = `${uri.toString()}:${getMethod.name}`
        const testItem = this.controller.createTestItem(testId, getMethod.name, uri)

        if (getMethod.pos) {
            const position = new vscode.Position(getMethod.pos.row, getMethod.pos.column)
            testItem.range = new vscode.Range(position, position)
        }

        this.controller.items.add(testItem)
        this.testItems.set(testId, testItem)
    }

    public async runTests(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
    ): Promise<void> {
        const run = this.controller.createTestRun(request)
        const tests = request.include ?? this.collectAllTests()

        for (const test of tests) {
            if (token.isCancellationRequested) {
                break
            }

            run.started(test)

            try {
                await this.runSingleTest(test, run)
            } catch (error) {
                const message = error instanceof Error ? error.message : "Unknown error"
                run.failed(test, new vscode.TestMessage(message))
            }
        }

        run.end()
    }

    private async debugTests(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
    ): Promise<void> {
        const tests = request.include ?? this.collectAllTests()

        for (const test of tests) {
            if (token.isCancellationRequested) {
                break
            }

            if (!test.uri) {
                continue
            }

            try {
                await vscode.commands.executeCommand("ton.debugTest", test.uri.fsPath, test.label)
            } catch (error) {
                console.error("Error debugging test:", error)
            }
        }
    }

    private collectAllTests(): vscode.TestItem[] {
        const tests: vscode.TestItem[] = []
        for (const [, item] of this.controller.items) {
            tests.push(item)
        }
        return tests
    }

    private async runSingleTest(test: vscode.TestItem, run: vscode.TestRun): Promise<void> {
        if (!test.uri) {
            run.failed(test, new vscode.TestMessage("Test file not found"))
            return
        }

        const filePath = test.uri.fsPath
        const testName = test.label

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
            if (!workspaceFolder) {
                throw new Error("No workspace folder found")
            }

            const cwd = workspaceFolder.uri.fsPath

            let actonPath = "acton"
            const possiblePaths = [
                "./target/release/acton",
                "../emulator-rs/target/release/acton",
                "../../emulator-rs/target/release/acton",
            ]

            for (const path of possiblePaths) {
                const fullPath = join(cwd, path)
                try {
                    await vscode.workspace.fs.stat(vscode.Uri.file(fullPath))
                    actonPath = fullPath
                    break
                } catch {
                    // Path doesn't exist, continue
                }
            }

            console.log(`Running test ${testName} with acton at: ${actonPath}`)

            await new Promise<void>(resolve => {
                const process = spawn(actonPath, ["test", filePath, "--filter", testName], {
                    cwd,
                    stdio: ["ignore", "pipe", "pipe"],
                })

                process.stdout.on("data", (data: Buffer) => {
                    const chunk = data.toString()
                    run.appendOutput(chunk.replace(/\n/g, "\r\n"))
                    console.log(`Test output: ${chunk.trim()}`)
                })

                process.stderr.on("data", (data: Buffer) => {
                    const chunk = data.toString()
                    run.appendOutput(chunk.replace(/\n/g, "\r\n"))
                    console.error(`Test stderr: ${chunk.trim()}`)
                })

                process.on("close", code => {
                    const passed = code === 0
                    if (passed) {
                        run.passed(test)
                    } else {
                        run.failed(test, new vscode.TestMessage("Test failed"))
                    }
                    resolve()
                })

                process.on("error", error => {
                    run.failed(test, new vscode.TestMessage(`Process error: ${error.message}`))
                    resolve()
                })
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error"
            run.failed(test, new vscode.TestMessage(message))
        }
    }

    public dispose(): void {
        this.controller.dispose()
    }
}
