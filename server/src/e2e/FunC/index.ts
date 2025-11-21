//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as path from "node:path"

import * as Mocha from "mocha"
import {glob} from "glob"
import {Suite, Test} from "mocha"

// node.js 20+ builtin
const globSync = (globs: string[], options: {cwd: string}): string[] => {
    return globs.flatMap(g => glob.sync(g, options))
}

interface TestFilterOptions {
    readonly suite?: string
    readonly testPattern?: string
    readonly verbose?: boolean
}

function getFilterOptions(): TestFilterOptions {
    return {
        suite: process.env["TON_TEST_SUITE"],
        testPattern: process.env["TON_TEST_PATTERN"],
        verbose: process.env["TON_TEST_VERBOSE"] === "true",
    }
}

function getTestFilePattern(options: TestFilterOptions): string {
    if (options.suite) {
        return `${options.suite}.test.js`
    }
    return "*.test.js"
}

function shouldIncludeTest(testName: string, options: TestFilterOptions): boolean {
    if (options.testPattern) {
        return testName.toLowerCase().includes(options.testPattern.toLowerCase())
    }
    return true
}

export async function run(): Promise<void> {
    const options = getFilterOptions()

    if (options.verbose) {
        console.log("Test filter options:", options)
    }

    const mocha = new Mocha({
        ui: "tdd",
        color: true,
        timeout: 20_000,
    })

    process.env["TON_TESTS"] = "true"
    process.env["TEST_FUNC_STDLIB_PATH"] = "../server/src/e2e/FunC/stdlib"

    const testsRoot = path.resolve(__dirname, ".")
    const testFilePattern = getTestFilePattern(options)

    if (options.verbose) {
        console.log(`Looking for test files matching: ${testFilePattern}`)
        console.log(`In directory: ${testsRoot}`)
    }

    return new Promise((resolve, reject) => {
        glob(testFilePattern, {
            cwd: testsRoot,
        })
            .then(files => {
                files.sort((a, b) => {
                    if (a.includes("multifile-") && b.includes("multifile-")) {
                        return Number(a < b)
                    }
                    if (a.includes("multifile-") && !b.includes("multifile-")) {
                        return 1
                    }
                    if (!a.includes("multifile-") && b.includes("multifile-")) {
                        return -1
                    }
                    return Number(a < b)
                })

                if (files.length === 0) {
                    if (options.suite) {
                        console.error(`No test suite found matching: ${options.suite}`)
                        console.log("Available test suites:")
                        const allFiles = globSync(["*.test.js"], {cwd: testsRoot})
                        for (const file of allFiles) {
                            const suiteName = path.basename(file, ".test.js")
                            console.log(`  - ${suiteName}`)
                        }
                        reject(new Error(`Test suite '${options.suite}' not found`))
                    } else {
                        reject(new Error("No test files found"))
                        return
                    }
                }

                if (options.verbose) {
                    console.log(`Found ${files.length} test file(s):`)
                    for (const file of files) {
                        console.log(`  - ${file}`)
                    }
                }

                for (const f of files) {
                    mocha.addFile(path.resolve(testsRoot, f))
                }

                if (options.testPattern) {
                    const originalRun = mocha.run.bind(mocha)
                    mocha.run = function (callback: (failures: number) => void) {
                        const suite = this.suite
                        filterTestsRecursively(suite, options)
                        return originalRun(callback)
                    }
                }

                try {
                    mocha.run(failures => {
                        if (failures > 0) {
                            reject(new Error(`${failures} tests failed.`))
                        } else {
                            resolve()
                        }
                    })
                } catch (error) {
                    reject(error instanceof Error ? error : new Error(String(error)))
                }
            })
            .catch((error: unknown) => {
                reject(error instanceof Error ? error : new Error(String(error)))
            })
    })
}

function filterTestsRecursively(suite: Suite, options: TestFilterOptions): void {
    if (!options.testPattern) return

    suite.tests = suite.tests.filter((test: Test) => shouldIncludeTest(test.title, options))
    for (const childSuite of suite.suites) {
        filterTestsRecursively(childSuite, options)
    }
    suite.suites = suite.suites.filter((childSuite: Suite) => hasTests(childSuite))
}

function hasTests(suite: Suite): boolean {
    if (suite.tests.length > 0) {
        return true
    }
    return suite.suites.some(childSuite => hasTests(childSuite))
}
