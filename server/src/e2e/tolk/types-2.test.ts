//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as assert from "node:assert"

import * as vscode from "vscode"

import type {TestCase} from "../common/TestParser"

import {BaseTestSuite} from "../common/BaseTestSuite"

export interface GetTypeAtPositionParams {
    readonly textDocument: {
        readonly uri: string
    }
    readonly position: {
        readonly line: number
        readonly character: number
    }
}

export interface GetTypeAtPositionResponse {
    readonly type: string | null
}

interface TypePosition {
    readonly line: number
    readonly character: number
    readonly expectedType: string
}

suite("Type Inference Test Suite 2", () => {
    const testSuite = new (class extends BaseTestSuite {
        public findTypePositions(input: string): TypePosition[] {
            const positions: TypePosition[] = []
            const lines = input.split("\n")

            lines.forEach((line, i) => {
                if (line.includes("//!")) {
                    const caretPosition = line.indexOf("^")

                    const character = caretPosition
                    const expectedType = line.slice(caretPosition + 1).trim()

                    positions.push({
                        line: i - 1,
                        character: character,
                        expectedType,
                    })
                }
            })
            return positions
        }

        private async getType(position: vscode.Position): Promise<string | undefined> {
            const params: GetTypeAtPositionParams = {
                textDocument: {
                    uri: this.document.uri.toString(),
                },
                position: {
                    line: position.line,
                    character: position.character,
                },
            }

            const response = await vscode.commands.executeCommand<GetTypeAtPositionResponse>(
                "tolk.getTypeAtPosition",
                params,
            )

            return response.type ?? undefined
        }

        protected runTest(testFile: string, testCase: TestCase): void {
            test(`Types: ${testCase.name}`, async () => {
                const positions = this.findTypePositions(testCase.input)

                await this.replaceDocumentText(testCase.input)

                const errors: string[] = []

                for (const pos of positions) {
                    const params = new vscode.Position(pos.line, pos.character)
                    const type = await this.getType(params)
                    const actual = type ?? "unknown"

                    if (actual !== pos.expectedType) {
                        errors.push(
                            `type inference error at line ${pos.line + 1}:${pos.character}: expected ${pos.expectedType}, got ${actual}`,
                        )
                    }
                }

                const actual = errors.length === 0 ? "ok" : errors.join("\n")

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

    testSuite.runTestsFromDirectory("types2")
})
