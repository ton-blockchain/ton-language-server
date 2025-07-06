//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as vscode from "vscode"
import * as assert from "node:assert"
import {BaseTestSuite} from "./BaseTestSuite"
import type {TestCase} from "../common/TestParser"

suite("Multi file Intentions Test Suite", () => {
    const testSuite = new (class extends BaseTestSuite {
        public async getCodeActions(input: string): Promise<vscode.CodeAction[]> {
            const selectionStart = input.indexOf("<selection>")
            const selectionEnd = input.indexOf("</selection>")

            let range: vscode.Range
            let textWithoutMarkers: string

            if (selectionStart !== -1 && selectionEnd !== -1) {
                textWithoutMarkers = input.replace("<selection>", "").replace("</selection>", "")
                await this.replaceDocumentText(textWithoutMarkers)

                const startPos = this.document.positionAt(selectionStart)
                const endPos = this.document.positionAt(selectionEnd - "<selection>".length)
                range = new vscode.Range(startPos, endPos)
            } else {
                textWithoutMarkers = input.replace("<caret>", "")
                await this.replaceDocumentText(textWithoutMarkers)

                const caretIndex = input.indexOf("<caret>")
                if (caretIndex === -1) {
                    throw new Error("No <caret> or <selection> markers found in input")
                }

                const position = this.calculatePosition(input, caretIndex)
                range = new vscode.Range(position, position)
            }

            return vscode.commands.executeCommand<vscode.CodeAction[]>(
                "vscode.executeCodeActionProvider",
                this.document.uri,
                range,
            )
        }

        protected runTest(testFile: string, testCase: TestCase): void {
            test(`Intention: ${testCase.name}`, async () => {
                await this.setupAdditionalFiles(testCase)

                await this.replaceDocumentText(testCase.input)
                const actions = await this.getCodeActions(this.document.getText())

                if (actions.length === 0) {
                    if (BaseTestSuite.UPDATE_SNAPSHOTS) {
                        this.updates.push({
                            filePath: testFile,
                            testName: testCase.name,
                            actual: "No intentions",
                        })
                    } else {
                        assert.strictEqual(actions.length, 0, "No intentions")
                    }
                    return
                }

                let selectedAction = actions[0]

                const intentionName = testCase.properties.get("intention")
                if (intentionName) {
                    const found = actions.find(action => action.title === intentionName)
                    if (!found) {
                        throw new Error(
                            `Intention "${intentionName}" not found. Available intentions: ${actions
                                .map(a => a.title)
                                .join(", ")}`,
                        )
                    }
                    selectedAction = found
                }

                const command = selectedAction.command
                if (!command || !command.arguments) throw new Error("No intention command")

                await vscode.commands.executeCommand(
                    command.command,
                    command.arguments[0] as unknown,
                )

                const resultText = this.editor.document.getText().replace(/\r\n/g, "\n")
                const expected = testCase.expected.trim()

                if (BaseTestSuite.UPDATE_SNAPSHOTS) {
                    this.updates.push({
                        filePath: testFile,
                        testName: testCase.name,
                        actual: resultText,
                    })
                } else {
                    assert.strictEqual(resultText.trim(), expected)
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

    testSuite.runTestsFromDirectory("multifile-intentions")
})
