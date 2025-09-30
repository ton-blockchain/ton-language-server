//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as assert from "node:assert"

import * as vscode from "vscode"

import type {TextDocumentPositionParams} from "vscode-languageserver"

import type {TestCase} from "../common/TestParser"

import {BaseTestSuite} from "./BaseTestSuite"

suite("References Test Suite", () => {
    const testSuite = new (class extends BaseTestSuite {
        public async getReferences(input: string): Promise<[vscode.Location[], string][]> {
            const caretIndexes = this.findCaretPositions(input)
            if (caretIndexes.length === 0) {
                throw new Error("No <caret> marker found in input")
            }

            const textWithoutCaret = input.replace(/<caret>/g, "")
            await this.replaceDocumentText(textWithoutCaret)

            return Promise.all(
                caretIndexes.map(async caretIndex => {
                    const position = this.calculatePosition(input, caretIndex)
                    const references = await this.getReferencesAt(position)
                    const scope = await this.getScopeAt(position)
                    return [references, scope]
                }),
            )
        }

        public async getReferencesAt(position: vscode.Position): Promise<vscode.Location[]> {
            return vscode.commands.executeCommand<vscode.Location[]>(
                "vscode.executeReferenceProvider",
                this.document.uri,
                position,
            )
        }

        public async getScopeAt(position: vscode.Position): Promise<string> {
            return vscode.commands.executeCommand<string>("tolk.executeGetScopeProvider", {
                textDocument: {
                    uri: this.document.uri.toString(),
                },
                position: {
                    line: position.line,
                    character: position.character,
                },
            } as TextDocumentPositionParams)
        }

        private formatLocation(position: vscode.Position): string {
            return `${position.line}:${position.character}`
        }

        private formatResult(
            positions: vscode.Position[],
            results: [vscode.Location[], string][],
        ): string {
            return positions
                .map((_pos, index) => {
                    const [references, scope] = results[index]
                    const locations = references
                        .map(ref => this.formatLocation(ref.range.start))
                        .join(", ")

                    return `References: [${locations}]\nScope: ${scope.replace(/\r\n/g, "\n")}`
                })
                .join("\n\n")
        }

        protected runTest(testFile: string, testCase: TestCase): void {
            test(`References: ${testCase.name}`, async () => {
                const caretIndexes = this.findCaretPositions(testCase.input)
                const positions = caretIndexes.map(index =>
                    this.calculatePosition(testCase.input, index),
                )
                const results = await this.getReferences(testCase.input)
                const actual = this.formatResult(positions, results)

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

    testSuite.runTestsFromDirectory("references")
})
