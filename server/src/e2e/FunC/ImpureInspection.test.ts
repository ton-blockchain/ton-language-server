import * as assert from "node:assert"

import * as vscode from "vscode"

import {TestCase} from "../common/TestParser"
import {BaseTestSuite} from "../common/BaseTestSuite"

suite("Impure inspection  test suite", () => {
    const testSuite = new (class extends BaseTestSuite {
        public async getInspections(): Promise<string> {
            await new Promise(resolve => setTimeout(resolve, 200))

            const diagnostics = vscode.languages.getDiagnostics(this.document.uri)

            const impureDiag = diagnostics
                .filter(d => d.code == "unused-impure")
                .sort((a, b) => {
                    if (a.range.start.line !== b.range.start.line) {
                        return a.range.start.line - b.range.start.line
                    }
                    return a.range.start.character - b.range.start.character
                })

            if (impureDiag.length === 0) {
                return "no issues"
            }

            return impureDiag
                .map(
                    d =>
                        `${d.range.start.line}:${d.range.start.character} to ${d.range.end.line}:${d.range.end.character}`,
                )
                .join("\n")
        }

        protected runTest(testFile: string, testCase: TestCase): void {
            test(`Case: ${testCase.name}`, async () => {
                await this.replaceDocumentText(testCase.input)
                const inspectionRes = await this.getInspections()
                assert.strictEqual(inspectionRes, testCase.expected)
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

    testSuite.runTestsFromDirectory("impure-inspection")
})
