//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import * as assert from "node:assert"
import {BaseTestSuite} from "./BaseTestSuite"
import type {TestCase} from "../common/TestParser"

suite("Folding Test Suite", () => {
    const testSuite = new (class extends BaseTestSuite {
        protected runTest(testFile: string, testCase: TestCase): void {
            test(`Folding: ${testCase.name}`, async () => {
                await this.replaceDocumentText(testCase.input)

                const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
                    "vscode.executeFoldingRangeProvider",
                    this.document.uri,
                )

                if (foldingRanges.length <= 0) {
                    throw new Error("No folding ranges found")
                }

                const rangesInfo = foldingRanges
                    .map(range => `[${range.start + 1}, ${range.end + 1}]`)
                    .join(", ")

                const lines = this.document.getText().split("\n")
                const startLines = new Set(foldingRanges.map(range => range.start))

                lines.forEach((lineContent, index) => {
                    if (startLines.has(index)) {
                        lines[index] = lineContent.replace(/\s*$/, "...")
                    }
                })

                const actualText =
                    `${rangesInfo}\n${lines.join("\n").replace(/\r\n/g, "\n")}`.trimEnd()
                const expectedText = testCase.expected.trimEnd()

                if (BaseTestSuite.UPDATE_SNAPSHOTS) {
                    this.updates.push({
                        filePath: testFile,
                        testName: testCase.name,
                        actual: actualText,
                    })
                } else {
                    assert.deepStrictEqual(actualText, expectedText)
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

    testSuite.runTestsFromDirectory("foldings")
})
