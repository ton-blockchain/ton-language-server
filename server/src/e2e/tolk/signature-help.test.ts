//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as assert from "node:assert"

import * as vscode from "vscode"

import type {TestCase} from "../common/TestParser"

import {BaseTestSuite} from "../common/BaseTestSuite"

suite("Signatures Test Suite", () => {
    const testSuite = new (class extends BaseTestSuite {
        public async getSignatureHelp(input: string): Promise<vscode.SignatureHelp | undefined> {
            const textWithoutCaret = input.replace("<caret>", "")
            await this.replaceDocumentText(textWithoutCaret)

            const caretIndex = input.indexOf("<caret>")
            if (caretIndex === -1) {
                throw new Error("No <caret> marker found in input")
            }

            const position = this.calculatePosition(input, caretIndex)
            this.editor.selection = new vscode.Selection(position, position)
            this.editor.revealRange(new vscode.Range(position, position))

            return vscode.commands.executeCommand<vscode.SignatureHelp>(
                "vscode.executeSignatureHelpProvider",
                this.document.uri,
                position,
            )
        }

        protected runTest(testFile: string, testCase: TestCase): void {
            test(`Signature: ${testCase.name}`, async () => {
                const signature = await this.getSignatureHelp(testCase.input)
                const items =
                    signature === undefined
                        ? ["no signature help"]
                        : signature.signatures.map(item => {
                              const label = item.label
                              if (item.activeParameter !== undefined) {
                                  const activeParamLabel =
                                      item.parameters[item.activeParameter]?.label ?? ""
                                  return `${activeParamLabel.toString()}\n${label}`.trim()
                              }
                              return ""
                          })

                const expected = testCase.expected
                    .split("\n")
                    .map(line => line.trimEnd())
                    .join("\n")
                const actual = items.join("\n")

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

    testSuite.runTestsFromDirectory("signature-help")
})
