//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as assert from "node:assert"

import * as vscode from "vscode"

import type {TestCase} from "../common/TestParser"

import {BaseTestSuite} from "../common/BaseTestSuite"

suite("Document Symbols Test Suite", () => {
    const testSuite = new (class extends BaseTestSuite {
        public async getDocumentSymbols(input: string): Promise<vscode.DocumentSymbol[]> {
            await this.replaceDocumentText(input)

            return vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                "vscode.executeDocumentSymbolProvider",
                this.document.uri,
            )
        }

        private formatSymbol(symbol: vscode.DocumentSymbol, indent: string = ""): string {
            const range = `[${symbol.range.start.line}:${symbol.range.start.character}-${symbol.range.end.line}:${symbol.range.end.character}]`
            const symbolKind = this.getSymbolKindName(symbol.kind)
            let result = `${indent}${symbol.name} (${symbolKind}) ${range}`

            if (symbol.children.length > 0) {
                const childIndent =
                    indent === "" ? "├─ " : indent.replace("├─ ", "│  ").replace("└─ ", "   ")
                for (let i = 0; i < symbol.children.length; i++) {
                    const isLast = i === symbol.children.length - 1
                    const prefix = isLast ? "└─ " : "├─ "
                    result +=
                        "\n" +
                        this.formatSymbol(symbol.children[i], childIndent.slice(0, -3) + prefix)
                }
            }

            return result
        }

        private getSymbolKindName(kind: vscode.SymbolKind): string {
            // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
            switch (kind) {
                case vscode.SymbolKind.Struct: {
                    return "struct"
                }
                case vscode.SymbolKind.TypeParameter: {
                    return "type alias"
                }
                case vscode.SymbolKind.Field: {
                    return "field"
                }
                case vscode.SymbolKind.Method: {
                    return "method"
                }
                case vscode.SymbolKind.Function: {
                    return "function"
                }
                case vscode.SymbolKind.Constant: {
                    return "constant"
                }
                case vscode.SymbolKind.Variable: {
                    return "global variable"
                }
                default: {
                    return "unknown"
                }
            }
        }

        protected runTest(testFile: string, testCase: TestCase): void {
            test(`Document Symbols: ${testCase.name}`, async () => {
                await this.setupAdditionalFiles(testCase)

                await this.replaceDocumentText(testCase.input)
                const symbols = await this.getDocumentSymbols(this.document.getText())

                const formattedSymbols = symbols.map(symbol => this.formatSymbol(symbol)).join("\n")

                const expected = this.normalizeLineEndings(testCase.expected.trimEnd())
                const actual = this.normalizeLineEndings(formattedSymbols || "No symbols found")

                if (BaseTestSuite.UPDATE_SNAPSHOTS) {
                    this.updates.push({
                        filePath: testFile,
                        testName: testCase.name,
                        actual: actual,
                    })
                } else {
                    assert.strictEqual(actual, expected, `Test failed: ${testCase.name}`)
                }

                await this.cleanupAdditionalFiles(testCase)
            })
        }
    })()

    suiteSetup(async function () {
        this.timeout(10_000)
        await testSuite.suiteSetup()
    })

    setup(async () => testSuite.setup())
    teardown(async () => testSuite.teardown())
    suiteTeardown(() => testSuite.suiteTeardown())

    testSuite.runTestsFromDirectory("document-symbols")
})
