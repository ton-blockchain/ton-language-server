//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as vscode from "vscode"

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
            // Корень дерева: возвращаем уникальные имена тестов
            return Promise.resolve(
                [...this.testRunsByName.keys()].map(testName => ({
                    id: `test-group-${testName}`,
                    label: testName,
                    description: `${this.testRunsByName.get(testName)?.length ?? 0} runs`,
                    contextValue: "testGroup",
                    iconPath: new vscode.ThemeIcon("beaker"),
                    collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                    type: "testName" as const,
                })),
            )
        }

        if (element.type === "testName") {
            // Для имени теста возвращаем test run как "Transaction #1", "#2", etc.
            const testRuns = this.testRunsByName.get(element.label) ?? []
            console.log("testRuns", testRuns.length)
            return Promise.resolve(
                testRuns.map((testRun, index) => ({
                    id: `${element.id}-run-${index}`,
                    label: `Transaction #${index}`,
                    description: new Date(testRun.timestamp).toLocaleTimeString(),
                    contextValue: "testRun",
                    iconPath: new vscode.ThemeIcon("check"),
                    collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                    type: "testRun" as const,
                    command: {
                        command: "ton.test.showTransactionDetails",
                        title: "Show Test Run Details",
                        arguments: [testRun],
                    },
                })),
            )
        }

        if (element.type === "testRun") {
            // Для test run возвращаем сообщения внутри транзакции
            const testName = element.id.split("-run-")[0].replace("test-group-", "")
            const runIndexStr = element.id.split("-run-")[1]
            const runIndex = Number.parseInt(runIndexStr)
            const testRuns = this.testRunsByName.get(testName) ?? []
            const testRun = testRuns.at(runIndex) // Обратный порядок из-за unshift

            const messageItems: TestTreeItem[] = []

            // Добавляем входящее сообщение, если оно есть
            if (testRun) {
                testRun.transactions.forEach((tx, txIndex) => {
                    if (tx.transaction.inMessage) {
                        messageItems.push({
                            id: `${element.id}-tx-${txIndex}-in`,
                            label: `Incoming Message`,
                            description: `To: ${tx.address?.toString().slice(0, 10) ?? "unknown"}...`,
                            contextValue: "message",
                            iconPath: new vscode.ThemeIcon("arrow-right"),
                            collapsibleState: vscode.TreeItemCollapsibleState.None,
                            type: "message" as const,
                        })
                    }

                    // Добавляем исходящие действия
                    tx.outActions.forEach((action, actionIndex) => {
                        messageItems.push({
                            id: `${element.id}-tx-${txIndex}-out-${actionIndex}`,
                            label: `Outgoing Action: ${action.type}`,
                            description: action.type === "sendMsg" ? "Send Message" : action.type,
                            contextValue: "message",
                            iconPath: new vscode.ThemeIcon("arrow-left"),
                            collapsibleState: vscode.TreeItemCollapsibleState.None,
                            type: "message" as const,
                        })
                    })
                })
            }

            return Promise.resolve(messageItems)
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
