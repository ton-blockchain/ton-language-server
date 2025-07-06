//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as vscode from "vscode"
import {CompletionItem, Position} from "vscode"
import * as assert from "node:assert"
import {BaseTestSuite} from "./BaseTestSuite"
import type {TestCase} from "../common/TestParser"

suite("Multi file Completion Test Suite", () => {
    const testSuite = new (class extends BaseTestSuite {
        public async getFilteredCompletion(input: string): Promise<CompletionItem> {
            const textWithoutCaret = input.replace("<caret>", "")
            await this.replaceDocumentText(textWithoutCaret)

            const caretIndex = input.indexOf("<caret>")
            if (caretIndex === -1) {
                throw new Error("No <caret> marker found in input")
            }

            const position = this.calculatePosition(input, caretIndex)
            this.editor.selection = new vscode.Selection(position, position)
            this.editor.revealRange(new vscode.Range(position, position))

            const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                "vscode.executeCompletionItemProvider",
                this.document.uri,
                position,
                ".",
                100,
            )

            const textBeforeCursor = this.findWordBeforeCursor(position)

            // Filtering items to match better completion for this test
            const items = completions.items.filter(item => {
                const label = typeof item.label === "object" ? item.label.label : item.label
                return label.includes(textBeforeCursor.trim())
            })

            if (completions.items.length === 0) {
                throw new Error("No completions available for this test")
            }

            if (items.length <= 0) {
                return completions.items[0]
            }

            return items[0]
        }

        public async applyCompletionItem(completionItem: vscode.CompletionItem): Promise<void> {
            if (
                completionItem.insertText instanceof vscode.SnippetString &&
                completionItem.range !== undefined &&
                "inserting" in completionItem.range &&
                "replacing" in completionItem.range
            ) {
                await this.editor.insertSnippet(
                    completionItem.insertText,
                    completionItem.range.replacing,
                )
            }

            // If completion doesn't have a snippet
            if (
                typeof completionItem.insertText === "string" &&
                completionItem.range !== undefined &&
                "inserting" in completionItem.range &&
                "replacing" in completionItem.range
            ) {
                const cursorPosition = this.editor.selection.active
                const textToInsert: string = completionItem.insertText
                await this.editor.edit(builder => {
                    builder.insert(cursorPosition, textToInsert)
                })
            }

            const edits = completionItem.additionalTextEdits
            if (edits && edits.length > 0) {
                await this.editor.edit(builder => {
                    for (const textEdit of edits) {
                        builder.replace(textEdit.range, textEdit.newText)
                    }
                })
            }
        }

        protected runTest(testFile: string, testCase: TestCase): void {
            test(`Completion Select: ${testCase.name}`, async () => {
                await this.setupAdditionalFiles(testCase)

                const completion = await this.getFilteredCompletion(testCase.input)
                await this.applyCompletionItem(completion)

                const cursor = this.editor.selection.active
                const editorText = this.document.getText()
                const editorTextWithCursor = this.insertCursor(editorText, cursor)

                const expected = testCase.expected

                if (BaseTestSuite.UPDATE_SNAPSHOTS) {
                    this.updates.push({
                        filePath: testFile,
                        testName: testCase.name,
                        actual: editorTextWithCursor,
                    })
                } else {
                    assert.deepStrictEqual(editorTextWithCursor, expected)
                }

                await this.cleanupAdditionalFiles(testCase)
            })
        }

        protected insertCursor(text: string, position: Position): string {
            const lines = text.split(/\r?\n/)
            if (position.line >= lines.length) return text

            const line = lines[position.line]
            lines[position.line] =
                line.slice(0, position.character) + "<caret>" + line.slice(position.character)

            return lines.join("\n")
        }
    })()

    suiteSetup(async function () {
        this.timeout(10_000)
        await testSuite.suiteSetup()
    })

    setup(async () => testSuite.setup())
    teardown(async () => testSuite.teardown())
    suiteTeardown(() => testSuite.suiteTeardown())

    testSuite.runTestsFromDirectory("multifile-completion-select")
})
