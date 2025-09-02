//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as path from "node:path"
import {runTests} from "@vscode/test-electron"
import {mkdirSync} from "node:fs"

// eslint-disable-next-line functional/type-declaration-immutability
interface TestRunOptions {
    suite?: string
    test?: string
    file?: string
    updateSnapshots?: boolean
    verbose?: boolean
}

function parseArgs(): TestRunOptions {
    const args = process.argv.slice(2)
    const options: TestRunOptions = {}

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]

        switch (arg) {
            case "--suite":
            case "-s": {
                options.suite = args[++i]
                break
            }
            case "--test":
            case "-t": {
                options.test = args[++i]
                break
            }
            case "--file":
            case "-f": {
                options.file = args[++i]
                break
            }
            case "--update-snapshots":
            case "-u": {
                options.updateSnapshots = true
                break
            }
            case "--verbose":
            case "-v": {
                options.verbose = true
                break
            }
            case "--help":
            case "-h": {
                printHelp()
                process.exit(0)
                break
            }
        }
    }

    return options
}

function printHelp(): void {
    console.log(`TON Language Server E2E Tester

Usage: yarn test:e2e [options]

Options:
  -s, --suite <name>        Run specific test suite (e.g., completion, types)
  -t, --test <pattern>      Run tests matching pattern
  -f, --file <filename>     Run tests from specific file (e.g., struct.test, constants.test)
  -u, --update-snapshots    Update test snapshots
  -v, --verbose             Enable verbose logging
  -h, --help                Show this help

Examples:
  yarn test:e2e --suite completion
  yarn test:e2e --test "struct fields"
  yarn test:e2e --file constants.test
  yarn test:e2e --suite completion --file struct.test
  yarn test:e2e --suite types --verbose
  yarn test:e2e --update-snapshots --suite completion
`)
}

async function main(): Promise<void> {
    try {
        const options = parseArgs()

        if (options.updateSnapshots) {
            process.env["TON_UPDATE_SNAPSHOTS"] = "true"
        }

        if (options.verbose) {
            process.env["TON_TEST_VERBOSE"] = "true"
        }

        if (options.suite) {
            process.env["TON_TEST_SUITE"] = options.suite
        }

        if (options.test) {
            process.env["TON_TEST_PATTERN"] = options.test
        }

        if (options.file) {
            process.env["TON_TEST_FILE"] = options.file
        }

        if (options.verbose) {
            console.log("Starting e2e tests with options:", options)
        }

        const extensionDevelopmentPath = path.resolve(__dirname, "../../../")
        const extensionTestsPath = path.resolve(__dirname, "./out/tolk/index.js")
        const testWorkspace = path.resolve(__dirname, "../../../test-workspace")

        mkdirSync(testWorkspace, {recursive: true})

        if (options.verbose) {
            console.log("  extensionDevelopmentPath:", extensionDevelopmentPath)
            console.log("  extensionTestsPath:", extensionTestsPath)
            console.log("  testWorkspace:", testWorkspace)
        }

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [testWorkspace],
        })
    } catch (error) {
        console.error("Failed to run tests:", error)
        process.exit(1)
    }
}

void main()
