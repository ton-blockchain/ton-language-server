//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as fs from "node:fs"
import * as os from "node:os"

// eslint-disable-next-line functional/type-declaration-immutability
export interface TestCase {
    name: string
    readonly properties: Map<string, string>
    input: string
    expected: string
    readonly result?: string
    readonly propertiesOrder: string[]
    readonly files: Map<string, string> // Additional files: path -> content
}

enum ParserState {
    WaitingForTestStart = 0,
    ReadingProperties = 1,
    ReadingName = 2,
    ReadingInput = 3,
    ReadingFiles = 4,
    ReadingExpected = 5,
}

const LINE_ENDING: "\r\n" | "\n" = os.platform() === "win32" ? "\r\n" : "\n"
const SEPARATOR = "========================================================================"
const THIN_SEPARATOR = "------------------------------------------------------------------------"

export class TestParser {
    public static parseAll(content: string): TestCase[] {
        const tests: TestCase[] = []
        const lines = content.trim().split(LINE_ENDING)

        let state = ParserState.WaitingForTestStart
        let currentTest: Partial<TestCase & {propertiesOrder: string[]}> = {
            properties: new Map(),
            propertiesOrder: [],
            files: new Map(),
        }
        let currentContent = ""
        let currentFilePath = ""

        for (const l of lines) {
            const line = l.trimEnd()

            switch (state) {
                case ParserState.WaitingForTestStart: {
                    if (line === SEPARATOR) {
                        state = ParserState.ReadingProperties

                        currentTest = {
                            properties: new Map(),
                            propertiesOrder: [],
                            files: new Map(),
                        }
                    }
                    break
                }
                case ParserState.ReadingProperties: {
                    if (
                        line.startsWith("@") &&
                        currentTest.properties &&
                        currentTest.propertiesOrder
                    ) {
                        const propertyLine = line.slice(1) // remove @
                        const spaceIndex = propertyLine.indexOf(" ")
                        if (spaceIndex !== -1) {
                            const key = propertyLine.slice(0, spaceIndex)
                            currentTest.properties.set(
                                key,
                                propertyLine.slice(spaceIndex + 1).trim(),
                            )
                            currentTest.propertiesOrder.push(key)
                        }
                    } else {
                        currentTest.name = line
                        state = ParserState.ReadingName
                    }
                    break
                }
                case ParserState.ReadingName: {
                    if (line === SEPARATOR) {
                        state = ParserState.ReadingInput
                        currentContent = ""
                    }
                    break
                }
                case ParserState.ReadingInput: {
                    if (line === THIN_SEPARATOR) {
                        currentTest.input = currentContent.trim()
                        state = ParserState.ReadingExpected
                        currentContent = ""
                    } else if (line.startsWith("---FILE:")) {
                        currentTest.input = currentContent.trim()
                        state = ParserState.ReadingFiles
                        // Start new file
                        currentFilePath = line.slice(8).trim() // Remove "---FILE:" prefix
                        currentContent = ""
                    } else {
                        currentContent += line + "\n"
                    }
                    break
                }
                case ParserState.ReadingFiles: {
                    if (line === SEPARATOR) {
                        if (currentFilePath && currentTest.files) {
                            currentTest.files.set(currentFilePath, currentContent.trim())
                        }

                        currentTest.expected = ""
                        tests.push(currentTest as TestCase)
                        state = ParserState.ReadingProperties
                        currentTest = {
                            properties: new Map(),
                            propertiesOrder: [],
                            files: new Map(),
                        }
                        currentContent = ""
                        currentFilePath = ""
                    } else if (line === THIN_SEPARATOR) {
                        if (currentFilePath && currentTest.files) {
                            currentTest.files.set(currentFilePath, currentContent.trim())
                        }

                        state = ParserState.ReadingExpected
                        currentContent = ""
                        currentFilePath = ""
                    } else if (line.startsWith("---FILE:")) {
                        if (currentFilePath && currentTest.files) {
                            currentTest.files.set(currentFilePath, currentContent.trim())
                        }

                        currentFilePath = line.slice(8).trim() // Remove "---FILE:" prefix
                        currentContent = ""
                    } else {
                        currentContent += line + LINE_ENDING
                    }
                    break
                }
                case ParserState.ReadingExpected: {
                    if (line === SEPARATOR) {
                        currentTest.expected = currentContent.trim().replace(/\r\n/g, "\n")
                        tests.push(currentTest as TestCase)
                        state = ParserState.ReadingProperties
                        currentTest = {
                            properties: new Map(),
                            propertiesOrder: [],
                            files: new Map(),
                        }
                        currentContent = ""
                    } else {
                        currentContent += line + LINE_ENDING
                    }
                    break
                }
            }
        }

        if (currentTest.name) {
            if (state === ParserState.ReadingFiles) {
                if (currentFilePath && currentTest.files) {
                    currentTest.files.set(currentFilePath, currentContent.trim())
                }
                currentTest.expected = ""
            } else if (currentContent) {
                currentTest.expected = currentContent.trim().replace(/\r\n/g, "\n")
            }
            tests.push(currentTest as TestCase)
        }

        return tests
    }

    public static updateExpectedBatch(
        filePath: string,
        updates: {testName: string; actual: string}[],
    ): void {
        const content = fs.readFileSync(filePath, "utf8")
        const tests = this.parseAll(content)
        const newContent: string[] = []

        for (const test of tests) {
            if (newContent.length > 0) {
                newContent.push("")
            }

            newContent.push(SEPARATOR)

            for (const key of test.propertiesOrder) {
                newContent.push(`@${key} ${test.properties.get(key)}`)
            }

            newContent.push(test.name, SEPARATOR, test.input)

            // Add additional files if they exist
            if (test.files.size > 0) {
                for (const [filePath, fileContent] of test.files.entries()) {
                    newContent.push(`---FILE:${filePath}`, fileContent.replace(/\r\n/g, "\n"))
                }
            }

            newContent.push(THIN_SEPARATOR)

            const update = updates.find(u => u.testName === test.name)
            const expectedContent = update ? update.actual : test.expected
            newContent.push(expectedContent.replace(/\r\n/g, "\n"))
        }

        fs.writeFileSync(filePath, newContent.join("\n") + "\n")
    }
}
