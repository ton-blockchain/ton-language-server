//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as vscode from "vscode"
import * as assert from "node:assert"
import {BaseTestSuite} from "./BaseTestSuite"
import type {TestCase} from "../common/TestParser"
import * as path from "node:path"

suite("Multi file Resolve Test Suite", () => {
    const testSuite = new (class extends BaseTestSuite {
        private async getDefinitions(
            input: string,
        ): Promise<(vscode.LocationLink[] | vscode.Location[] | undefined)[]> {
            const caretIndexes = this.findCaretPositions(input)
            if (caretIndexes.length === 0) {
                throw new Error("No <caret> marker found in input")
            }

            const textWithoutCaret = input.replace(/<caret>/g, "")
            await this.replaceDocumentText(textWithoutCaret)

            return Promise.all(
                caretIndexes.map(async caretIndex => {
                    const position = this.calculatePosition(input, caretIndex)
                    return this.getDefinitionAt(position)
                }),
            )
        }

        private async getDefinitionAt(
            position: vscode.Position,
        ): Promise<vscode.LocationLink[] | vscode.Location[] | undefined> {
            return vscode.commands.executeCommand<vscode.LocationLink[]>(
                "vscode.executeDefinitionProvider",
                this.document.uri,
                position,
            )
        }

        private formatLocation(position: vscode.Position): string {
            return `${position.line}:${position.character}`
        }

        private formatResult(
            positions: vscode.Position[],
            definitions: (vscode.LocationLink[] | vscode.Location[] | undefined)[],
        ): string {
            return positions
                .map((pos, index) => {
                    const targets = definitions[index]
                    if (!targets || targets.length === 0) {
                        return `${this.formatLocation(pos)} unresolved`
                    }

                    const target = targets[0]
                    if (target instanceof vscode.Location) {
                        return `${this.formatLocation(pos)} -> ${this.formatLocation(
                            target.range.start,
                        )} (${path.relative(this.testDir, target.uri.fsPath)}) resolved`
                    }

                    return `${this.formatLocation(pos)} -> ${this.formatLocation(
                        target.targetRange.start,
                    )} (${path.relative(this.testDir, target.targetUri.fsPath)}) resolved`
                })
                .join("\n")
        }

        protected runTest(testFile: string, testCase: TestCase): void {
            test(`Resolve: ${testCase.name}`, async () => {
                await this.setupAdditionalFiles(testCase)

                const caretIndexes = this.findCaretPositions(testCase.input)
                const positions = caretIndexes.map(index =>
                    this.calculatePosition(testCase.input, index),
                )
                const definitions = await this.getDefinitions(testCase.input)
                const actual = this.formatResult(positions, definitions)

                if (BaseTestSuite.UPDATE_SNAPSHOTS) {
                    this.updates.push({
                        filePath: testFile,
                        testName: testCase.name,
                        actual,
                    })
                } else {
                    assert.strictEqual(actual, testCase.expected)
                }

                await this.cleanupAdditionalFiles(testCase)
            })
        }
    })()

    suiteSetup(async function () {
        this.timeout(10_000)
        await testSuite.suiteSetup()
    })

    setup(async () => {
        await testSuite.setup()
    })
    teardown(async () => {
        await testSuite.teardown()
    })
    suiteTeardown(() => {
        testSuite.suiteTeardown()
    })

    testSuite.runTestsFromDirectory("multifile-resolving")
})
