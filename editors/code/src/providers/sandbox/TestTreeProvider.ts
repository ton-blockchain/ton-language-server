//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as vscode from "vscode"

import {parseCallStack} from "../../common/call-stack-parser"

import {processTxString, TestDataMessage, TestRun} from "./test-types"

interface TestTreeItem {
    readonly id: string
    readonly label: string
    readonly description?: string
    readonly contextValue?: string
    readonly iconPath?: vscode.ThemeIcon
    readonly collapsibleState?: vscode.TreeItemCollapsibleState
    readonly command?: vscode.Command
    readonly type: "testName" | "testRun" | "message"
}

export class TestTreeProvider implements vscode.TreeDataProvider<TestTreeItem> {
    private readonly _onDidChangeTreeData: vscode.EventEmitter<TestTreeItem | undefined | null> =
        new vscode.EventEmitter<TestTreeItem | undefined | null>()
    public readonly onDidChangeTreeData: vscode.Event<TestTreeItem | undefined | null> =
        this._onDidChangeTreeData.event

    private readonly testRunsByName: Map<string, TestRun[]> = new Map()

    public addTestData(data: TestDataMessage): void {
        const transactions = processTxString(data.transactions)

        console.log(data, "with", transactions.length, "transactions")

        const testRun: TestRun = {
            id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            name: data.testName,
            timestamp: Date.now(),
            transactions: transactions,
            contracts: data.contracts,
            changes: data.changes,
            resultString: data.transactions,
        }

        const existingRuns = this.testRunsByName.get(data.testName) ?? []
        existingRuns.push(testRun)

        this.testRunsByName.set(data.testName, existingRuns)

        this._onDidChangeTreeData.fire(undefined)
    }

    public getTreeItem(element: TestTreeItem): vscode.TreeItem {
        return {
            id: element.id,
            label: element.label,
            description: element.description,
            contextValue: element.contextValue,
            iconPath: element.iconPath,
            collapsibleState: element.collapsibleState,
            command: element.command,
        }
    }

    public getChildren(element?: TestTreeItem): Thenable<TestTreeItem[]> {
        if (!element) {
            return Promise.resolve(
                [...this.testRunsByName.keys()].map(testName => ({
                    id: `test-group-${testName}`,
                    label: testName,
                    description: `${this.testRunsByName.get(testName)?.length ?? 0} transactions`,
                    contextValue: "testGroup",
                    iconPath: new vscode.ThemeIcon("beaker"),
                    collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                    type: "testName" as const,
                })),
            )
        }

        if (element.type === "testName") {
            const testRuns = this.testRunsByName.get(element.label) ?? []
            return Promise.all(
                testRuns.map(async (testRun, index) => {
                    const extractedName = await extractTransactionName(testRun)
                    const exitCode = getTestRunExitCode(testRun)
                    const baseLabel = extractedName ?? `Transaction #${index}`
                    const label = exitCode === 0 ? baseLabel : `${baseLabel} (exit: ${exitCode})`

                    return {
                        id: `${element.id}-run-${index}`,
                        label,
                        description: new Date(testRun.timestamp).toLocaleTimeString(),
                        contextValue: "testRun",
                        iconPath:
                            exitCode === 0
                                ? new vscode.ThemeIcon(
                                      "pass",
                                      new vscode.ThemeColor("testing.iconPassed"),
                                  )
                                : new vscode.ThemeIcon(
                                      "error",
                                      new vscode.ThemeColor("testing.iconFailed"),
                                  ),
                        collapsibleState: vscode.TreeItemCollapsibleState.None,
                        type: "testRun" as const,
                        command: {
                            command: "ton.test.showTransactionDetails",
                            title: "Show Test Run Details",
                            arguments: [testRun],
                        },
                    }
                }),
            )
        }

        return Promise.resolve([])
    }

    public getTestRun(testRunId: string): TestRun | undefined {
        for (const testRuns of this.testRunsByName.values()) {
            const found = testRuns.find(run => run.id === testRunId)
            if (found) return found
        }
        return undefined
    }

    public clearAllTests(): void {
        this.testRunsByName.clear()
        this._onDidChangeTreeData.fire(undefined)
    }

    public removeTestRun(testRunId: string): void {
        for (const [testName, testRuns] of this.testRunsByName.entries()) {
            const filteredRuns = testRuns.filter(run => run.id !== testRunId)
            if (filteredRuns.length === 0) {
                this.testRunsByName.delete(testName)
            } else {
                this.testRunsByName.set(testName, filteredRuns)
            }
        }
        this._onDidChangeTreeData.fire(undefined)
    }
}

async function extractTransactionName(testRun: TestRun): Promise<string | undefined> {
    const transactionWithCallStack = testRun.transactions.find(tx => tx.callStack)
    if (!transactionWithCallStack?.callStack) {
        return undefined
    }

    const parsedCallStack = parseCallStack(transactionWithCallStack.callStack)
    if (parsedCallStack.length === 0) {
        return undefined
    }

    const lastEntry = parsedCallStack.at(-1)
    if (!lastEntry?.file || lastEntry.line === undefined) {
        return undefined
    }

    try {
        const uri = vscode.Uri.file(lastEntry.file)
        const document = await vscode.workspace.openTextDocument(uri)
        const lines = document.getText().split("\n")

        const lineIndex = lastEntry.line - 1
        if (lineIndex < 0 || lineIndex >= lines.length) {
            return undefined
        }

        const line = lines[lineIndex].trim()

        const patterns = [
            // await object.sendMethod(
            /await\s+(\w+)\.(\w+)\s*\(/,
            // object.sendMethod(
            /(\w+)\.(\w+)\s*\(/,
            // sendMethod(
            /(\w+)\s*\(/,
        ]

        for (const pattern of patterns) {
            const match = line.match(pattern)
            if (match) {
                // Если нашли object.method, возвращаем object.method
                if (match[2]) {
                    return `${match[1]}.${match[2]}`
                }
                // Иначе просто method
                return match[1]
            }
        }

        for (let i = 1; i <= 3; i++) {
            const prevLineIndex = lineIndex - i
            if (prevLineIndex >= 0) {
                const prevLine = lines[prevLineIndex].trim()
                for (const pattern of patterns) {
                    const match = prevLine.match(pattern)
                    if (match) {
                        if (match[2]) {
                            return `${match[1]}.${match[2]}`
                        }
                        return match[1]
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error reading file for transaction name:", error)
    }

    return undefined
}

function getTestRunExitCode(testRun: TestRun): number {
    const failedTransaction = testRun.transactions.find(tx => {
        if (tx.computeInfo === "skipped") return false
        const exitCode = tx.computeInfo.exitCode
        return exitCode !== 0 && exitCode !== 1
    })

    if (!failedTransaction || failedTransaction.computeInfo === "skipped") {
        return 0
    }

    return failedTransaction.computeInfo.exitCode
}
