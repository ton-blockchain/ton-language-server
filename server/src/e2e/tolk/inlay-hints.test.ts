//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import * as assert from "node:assert"
import {BaseTestSuite} from "./BaseTestSuite"
import type {TestCase} from "../common/TestParser"

suite("Inlay Hints Test Suite", () => {
    const testSuite = new (class extends BaseTestSuite {
        public async getHints(input: string): Promise<vscode.InlayHint[]> {
            await this.replaceDocumentText(input)
            return vscode.commands.executeCommand<vscode.InlayHint[]>(
                "vscode.executeInlayHintProvider",
                this.document.uri,
                new vscode.Range(
                    this.document.positionAt(0),
                    this.document.positionAt(input.length),
                ),
            )
        }

        protected runTest(testFile: string, testCase: TestCase): void {
            test(`Hint: ${testCase.name}`, async () => {
                await this.replaceDocumentText(testCase.input)
                const hints = await this.getHints(this.document.getText())

                for (let x = 0; x < hints.length; x++) {
                    const hint = hints[x]

                    const label =
                        typeof hint.label === "string"
                            ? hint.label
                            : hint.label.map(p => p.value).join("")

                    const value = `/* ${label} */`

                    await this.editor.edit(editBuilder => {
                        editBuilder.insert(hint.position, value)
                    })

                    // recalculate positions of the next hint
                    const updatedHints = await this.getHints(this.document.getText())
                    if (x + 1 < hints.length && x + 1 < updatedHints.length) {
                        hints[x + 1].position = updatedHints[x + 1].position
                    }
                }

                const expected = testCase.expected.trimEnd()
                const actual = this.document.getText().trimEnd().replace(/\r\n/g, "\n")
                if (BaseTestSuite.UPDATE_SNAPSHOTS) {
                    this.updates.push({
                        filePath: testFile,
                        testName: testCase.name,
                        actual: actual,
                    })
                } else {
                    assert.deepStrictEqual(actual, expected)
                }
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

    testSuite.runTestsFromDirectory("inlay-hints")
})
