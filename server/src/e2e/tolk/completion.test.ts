//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import * as assert from "node:assert"
import {BaseTestSuite} from "./BaseTestSuite"
import type {TestCase} from "../common/TestParser"
import {CompletionItem} from "vscode"

suite("Completion Test Suite", () => {
    const testSuite = new (class extends BaseTestSuite {
        public async getCompletions(
            input: string,
            triggerCharacter?: string,
        ): Promise<CompletionItem[]> {
            const textWithoutCaret = input.replace("<caret>", "")
            await this.replaceDocumentText(textWithoutCaret)

            const caretIndex = input.indexOf("<caret>")
            if (caretIndex === -1) {
                throw new Error("No <caret> marker found in input")
            }

            const position = this.calculatePosition(input, caretIndex)
            this.editor.selection = new vscode.Selection(position, position)
            this.editor.revealRange(new vscode.Range(position, position))

            const textBeforeCursor = this.findWordBeforeCursor(position)

            const items = await vscode.commands.executeCommand<vscode.CompletionList>(
                "vscode.executeCompletionItemProvider",
                this.document.uri,
                position,
                triggerCharacter,
            )

            const finalItems = items.items.filter(item => {
                const label = typeof item.label === "object" ? item.label.label : item.label
                return label.includes(textBeforeCursor.trim())
            })

            if (finalItems.length > 200) {
                return finalItems.slice(0, 200)
            }
            return finalItems
        }

        protected runTest(testFile: string, testCase: TestCase): void {
            test(`Completion: ${testCase.name}`, async () => {
                await this.setupAdditionalFiles(testCase)

                const completions = await this.getCompletions(testCase.input, ".")

                const items = completions
                    .filter(item => Number(item.kind) !== 0)
                    .map(item => {
                        const label = typeof item.label === "object" ? item.label.label : item.label
                        const details =
                            (typeof item.label === "object" ? item.label.detail : item.detail) ?? ""
                        const description =
                            typeof item.label === "object" && item.label.description
                                ? `  ${item.label.description}`
                                : ""

                        return `${item.kind?.toString().padEnd(2)} ${label}${details}${description}`.trimEnd()
                    })

                const expected = testCase.expected.trimEnd()
                const actual = items.length > 0 ? items.join("\n") : "No completion items"

                if (BaseTestSuite.UPDATE_SNAPSHOTS) {
                    this.updates.push({
                        filePath: testFile,
                        testName: testCase.name,
                        actual: actual,
                    })
                } else {
                    assert.deepStrictEqual(actual, expected)
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

    testSuite.runTestsFromDirectory("completion")
})
