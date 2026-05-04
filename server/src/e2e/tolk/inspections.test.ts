//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as assert from "node:assert"

import * as vscode from "vscode"

import type {TestCase} from "../common/TestParser"

import {BaseTestSuite} from "../common/BaseTestSuite"

suite("Inspection Test Suite", () => {
    const testSuite = new (class extends BaseTestSuite {
        public async getInspections(): Promise<string> {
            await new Promise(resolve => setTimeout(resolve, 100))

            const diagnostics = vscode.languages.getDiagnostics(this.document.uri)
            if (diagnostics.length === 0) {
                return "no issues"
            }

            diagnostics.sort((a, b) => {
                if (a.range.start.line !== b.range.start.line) {
                    return a.range.start.line - b.range.start.line
                }
                return a.range.start.character - b.range.start.character
            })

            return diagnostics
                .map(
                    d =>
                        `${d.severity} ${d.range.start.line}:${d.range.start.character} to ${d.range.end.line}:${d.range.end.character} ${d.message} (${d.source})`,
                )
                .join("\n")
        }

        protected runTest(testFile: string, testCase: TestCase): void {
            test(`Inspection: ${testCase.name}`, async () => {
                await this.replaceDocumentText(testCase.input)

                const actual = await this.getInspections()

                if (BaseTestSuite.UPDATE_SNAPSHOTS) {
                    this.updates.push({
                        filePath: testFile,
                        testName: testCase.name,
                        actual,
                    })
                } else {
                    assert.strictEqual(actual, testCase.expected)
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

    testSuite.runTestsFromDirectory("inspections")
})
