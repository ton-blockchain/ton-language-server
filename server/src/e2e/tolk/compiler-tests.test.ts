//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as vscode from "vscode"
import * as assert from "node:assert"
import {BaseTestSuite} from "./BaseTestSuite"
import * as path from "node:path"
import {glob} from "glob"

interface UnresolvedIdentifier {
    readonly name: string
    readonly line: number
    readonly character: number
}

suite("Compiler Tests Suite", () => {
    const testSuite = new (class extends BaseTestSuite {
        private async getUnresolvedIdentifiers(): Promise<UnresolvedIdentifier[]> {
            const result = await vscode.commands.executeCommand<string>(
                "tolk.getUnresolvedIdentifiers",
                {
                    textDocument: {
                        uri: this.document.uri.toString(),
                    },
                },
            )

            if (!result || result === "File not found" || result === "Invalid parameters") {
                return []
            }

            return JSON.parse(result) as UnresolvedIdentifier[]
        }

        public runTestsFromTolkFiles(): void {
            const testCasesPath = path.join(
                __dirname,
                "..",
                "..",
                "tolk",
                "testcases",
                "unresolved-identifiers",
                "*.tolk",
            )
            const tolkFiles = glob.sync(testCasesPath, {windowsPathsNoEscape: true})

            console.log("tolkFiles", tolkFiles.length)

            for (const tolkFile of tolkFiles) {
                const testName = path.basename(tolkFile, ".tolk")

                test(`Compiler tests: ${testName}`, async () => {
                    const fs = await import("node:fs/promises")
                    const content = await fs.readFile(tolkFile, "utf8")

                    await this.replaceDocumentText('import "@stdlib/common";\n\n' + content)

                    const unresolvedIdentifiers = await this.getUnresolvedIdentifiers()

                    if (unresolvedIdentifiers.length > 0) {
                        assert.strictEqual(
                            unresolvedIdentifiers.length,
                            0,
                            `Expected no unresolved identifiers:\n${unresolvedIdentifiers.map(it => it.name + ` at ${it.line + 1}:${it.character}`).join("\n")}`,
                        )
                    }
                })
            }
        }

        protected runTest(): void {}
    })()

    suiteSetup(async function () {
        this.timeout(10_000)
        await testSuite.suiteSetup()
    })

    setup(async () => testSuite.setup())
    teardown(async () => testSuite.teardown())
    suiteTeardown(() => testSuite.suiteTeardown())

    testSuite.runTestsFromTolkFiles()
})
