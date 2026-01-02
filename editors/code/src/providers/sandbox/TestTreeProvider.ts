//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as vscode from "vscode"
import {Cell, loadTransaction} from "@ton/core"
import {SourceMap} from "ton-source-map"

import {parseCallStack} from "../../common/call-stack-parser"
import {
    processTxString,
    processRawTransactions,
    RawTransactionInfo,
} from "../../common/types/raw-transaction"

import {TestDataMessage, TransactionRun} from "./test-types"

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

interface ActonTrace {
    readonly name: string
    readonly pos: {
        readonly row: number
        readonly column: number
        readonly uri: string
    }
    readonly txs: {
        readonly transactions: readonly ActonTransaction[]
    }
    readonly contracts: readonly ActonContract[]
}

interface ActonTransaction {
    readonly raw_transaction: string
    readonly parent_transaction: string | null
    readonly child_transactions: readonly string[]
    readonly shard_account_before: string
    readonly shard_account: string
    readonly vm_log_diff: string
    readonly logs: string
    readonly actions: string | null
    readonly dest_contract_info: string | null
}

interface ActonContract {
    readonly name: string
    readonly code_boc64: string
    readonly source_map: SourceMap | undefined
}

export class TestTreeProvider implements vscode.TreeDataProvider<TestTreeItem> {
    private readonly _onDidChangeTreeData: vscode.EventEmitter<TestTreeItem | undefined | null> =
        new vscode.EventEmitter<TestTreeItem | undefined | null>()
    public readonly onDidChangeTreeData: vscode.Event<TestTreeItem | undefined | null> =
        this._onDidChangeTreeData.event

    private readonly txRunsByName: Map<string, TransactionRun[]> = new Map()

    public constructor() {
        this.initWatcher()
    }

    private initWatcher(): void {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (!workspaceRoot) return

        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceRoot, ".acton/traces/*.json"),
        )

        watcher.onDidCreate(uri => {
            void this.loadTraceFile(uri)
        })
        watcher.onDidChange(uri => {
            void this.loadTraceFile(uri)
        })

        // Initial scan
        vscode.workspace
            .findFiles(new vscode.RelativePattern(workspaceRoot, ".acton/traces/*.json"))
            .then(uris => {
                for (const uri of uris) {
                    void this.loadTraceFile(uri)
                }
            })
    }

    private async loadTraceFile(uri: vscode.Uri): Promise<void> {
        try {
            const content = await vscode.workspace.fs.readFile(uri)
            const json = JSON.parse(Buffer.from(content).toString("utf8")) as ActonTrace

            this.processActonTrace(json)
        } catch (error) {
            console.error(`Failed to load trace file ${uri.fsPath}:`, error)
        }
    }

    private processActonTrace(trace: ActonTrace): void {
        const contractCodeHashes: Map<string, ActonContract> = new Map()
        for (const contract of trace.contracts) {
            try {
                const cell = Cell.fromBase64(contract.code_boc64)
                contractCodeHashes.set(cell.hash().toString("hex"), contract)
            } catch (error: unknown) {
                console.error("Failed to parse contract code:", error)
            }
        }

        const rawTxs: RawTransactionInfo[] = trace.txs.transactions.map(actonTx => {
            const transactionHex = Buffer.from(actonTx.raw_transaction, "base64").toString("hex")
            const parsedTx = loadTransaction(Cell.fromHex(transactionHex).asSlice())

            let code: string | undefined
            let sourceMap: SourceMap | undefined
            let contractName: string | undefined

            const contract = trace.contracts.find(c => c.name === actonTx.dest_contract_info)

            if (contract) {
                code = Buffer.from(contract.code_boc64, "base64").toString("hex")
                sourceMap = contract.source_map ?? undefined
                contractName = contract.name
            }

            return {
                transaction: transactionHex,
                parsedTransaction: parsedTx,
                fields: {vmLogs: actonTx.logs},
                code,
                sourceMap,
                contractName,
                parentId: actonTx.parent_transaction ?? undefined,
                childrenIds: [...actonTx.child_transactions],
                oldStorage: undefined,
                newStorage: undefined,
                callStack: undefined,
            } satisfies RawTransactionInfo
        })

        const processedTxs = processRawTransactions(rawTxs)

        const serializedResult = JSON.stringify({
            transactions: rawTxs.map(tx => ({
                ...tx,
                parsedTransaction: undefined,
            })),
        })

        const txRun: TransactionRun = {
            id: `test-${trace.name}-${Date.now()}`,
            name: trace.name,
            timestamp: Date.now(),
            transactions: processedTxs,
            contracts: [],
            serializedResult: serializedResult,
        }

        this.txRunsByName.set(trace.name, [txRun])
        this._onDidChangeTreeData.fire(undefined)
    }

    public addTestData(data: TestDataMessage): void {
        const transactions = processTxString(data.transactions) ?? []

        const txRun: TransactionRun = {
            id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            name: data.testName,
            timestamp: Date.now(),
            transactions: transactions,
            contracts: data.contracts,
            serializedResult: data.transactions,
        }

        const existingRuns = this.txRunsByName.get(data.testName) ?? []
        const lastRun = existingRuns.at(-1)

        // Consider all transactions as a new test run after 20 seconds
        if (lastRun && Date.now() - lastRun.timestamp > 20 * 1000) {
            this.txRunsByName.set(data.testName, [txRun])
        } else {
            existingRuns.push(txRun)
            this.txRunsByName.set(data.testName, existingRuns)
        }

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
                [...this.txRunsByName.keys()].map(testName => ({
                    id: `test-group-${testName}`,
                    label: testName,
                    description: `${this.txRunsByName.get(testName)?.length ?? 0} transactions`,
                    contextValue: "testGroup",
                    iconPath: new vscode.ThemeIcon("beaker"),
                    collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                    type: "testName" as const,
                })),
            )
        }

        if (element.type === "testName") {
            const txRuns = this.txRunsByName.get(element.label) ?? []
            return Promise.all(
                txRuns.map(async (testRun, index) => {
                    const extractedName = await extractTransactionName(testRun)
                    const exitCode = getTxRunExitCode(testRun)
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
}

async function extractTransactionName(txRun: TransactionRun): Promise<string | undefined> {
    const txWithCallStack = txRun.transactions.find(tx => tx.callStack)
    if (!txWithCallStack?.callStack) {
        return undefined
    }

    const parsedCallStack = parseCallStack(txWithCallStack.callStack)
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
                if (match[2]) {
                    return `${match[1]}.${match[2]}`
                }
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

function getTxRunExitCode(txRun: TransactionRun): number {
    const failedTransaction = txRun.transactions.find(tx => {
        if (tx.computeInfo === "skipped") return false
        const exitCode = tx.computeInfo.exitCode
        return exitCode !== 0 && exitCode !== 1
    })

    if (!failedTransaction || failedTransaction.computeInfo === "skipped") {
        return 0
    }

    return failedTransaction.computeInfo.exitCode
}
