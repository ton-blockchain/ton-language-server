//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import * as path from "node:path"
import * as fs from "node:fs"
import * as glob from "glob"
import {TestCase, TestParser} from "../common/TestParser"
import {existsSync} from "node:fs"
import {Position, TextDocument, Uri} from "vscode"

export interface TestUpdate {
    readonly filePath: string
    readonly testName: string
    readonly actual: string
}

export abstract class BaseTestSuite {
    protected static readonly UPDATE_SNAPSHOTS: boolean =
        process.env["TON_UPDATE_SNAPSHOTS"] === "true"

    protected document!: vscode.TextDocument
    protected editor!: vscode.TextEditor
    protected testFilePath!: string
    protected testDir: string = ""
    protected updates: TestUpdate[] = []
    protected additionalFiles: TextDocument[] = []

    protected normalizeLineEndings(text: string): string {
        return text.replace(/\r\n/g, "\n")
    }

    public async suiteSetup(): Promise<void> {
        await activate()
    }

    public workingDir(): string {
        return path.join(__dirname, "../../../../../test-workspace/")
    }

    public async setup(): Promise<void> {
        this.testFilePath = path.join(this.workingDir(), "test.tolk")
        this.testDir = path.dirname(this.testFilePath)
        await fs.promises.mkdir(this.testDir, {recursive: true})
        await fs.promises.writeFile(this.testFilePath, "")

        this.document = await vscode.workspace.openTextDocument(this.testFilePath)
        await vscode.languages.setTextDocumentLanguage(this.document, "tolk")

        await this.openMainFile()
    }

    public async openMainFile(): Promise<void> {
        this.editor = await vscode.window.showTextDocument(this.document)
    }

    public async teardown(): Promise<void> {
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor")
        try {
            await fs.promises.unlink(this.testFilePath)
        } catch (error) {
            console.warn("Failed to delete test file:", error)
        }
    }

    protected async openFile(name: string, content: string): Promise<void> {
        const filePath = path.join(this.workingDir(), name)

        const dir = path.dirname(filePath)
        await fs.promises.mkdir(dir, {recursive: true})

        await fs.promises.writeFile(filePath, content)

        const additionalFile = await vscode.workspace.openTextDocument(filePath)
        await vscode.languages.setTextDocumentLanguage(additionalFile, "tolk")

        await vscode.window.showTextDocument(additionalFile, {
            preview: true,
            preserveFocus: false,
        })

        this.additionalFiles.push(additionalFile)
    }

    protected async closeFile(name: string): Promise<void> {
        const filePath = path.join(this.workingDir(), name)

        const document = this.additionalFiles.find(item => item.uri.fsPath === filePath)
        if (!document) return

        const bytes = new TextEncoder().encode("")
        await vscode.workspace.fs.writeFile(Uri.file(filePath), bytes)

        await fs.promises.writeFile(filePath, "")

        await vscode.window.showTextDocument(document, {
            preview: true,
            preserveFocus: false,
        })

        await vscode.commands.executeCommand("workbench.action.closeActiveEditor")

        if (!existsSync(filePath)) {
            return
        }

        await fs.promises.rm(filePath)
    }

    protected async setupAdditionalFiles(testCase: TestCase): Promise<void> {
        if (testCase.files.size === 0) {
            return
        }

        this.logTestInfo(`Setting up ${testCase.files.size} additional file(s)`)

        for (const [filePath, content] of testCase.files.entries()) {
            await this.openFile(filePath, content)
            this.logTestInfo(`Created file: ${filePath}`)
        }

        await this.openMainFile()
    }

    protected async cleanupAdditionalFiles(testCase: TestCase): Promise<void> {
        if (testCase.files.size === 0) {
            return
        }

        for (const filePath of testCase.files.keys()) {
            await this.closeFile(filePath)
            this.logTestInfo(`Cleaned up file: ${filePath}`)
        }
    }

    protected hasAdditionalFiles(testCase: TestCase): boolean {
        return testCase.files.size > 0
    }

    protected calculatePosition(text: string, caretIndex: number): vscode.Position {
        const textBeforeCaret = text.slice(0, caretIndex)
        const lines = textBeforeCaret.split("\n")
        const line = lines.length - 1
        const character = lines[line].length

        return new vscode.Position(line, character)
    }

    protected async replaceDocumentText(text: string): Promise<void> {
        await this.editor.edit(edit => {
            const fullRange = new vscode.Range(
                this.document.positionAt(0),
                this.document.positionAt(this.document.getText().length),
            )
            edit.replace(fullRange, text)
        })
    }

    protected findWordBeforeCursor(position: Position): string {
        const line = this.document.lineAt(position.line)
        const textBeforeCursor = line.text.slice(0, position.character)

        const letterRe = new RegExp(/[\da-z]/i)

        for (let i = textBeforeCursor.length; i >= 0; i--) {
            const symbol = textBeforeCursor[i]
            if (!letterRe.test(symbol)) {
                return textBeforeCursor.slice(i + 1, line.text.length)
            }
        }

        return line.text
    }

    protected findCaretPositions(text: string): number[] {
        const positions: number[] = []
        const regex = /<caret>/g
        let match: RegExpExecArray | null = null

        while ((match = regex.exec(text)) !== null) {
            positions.push(match.index)
        }

        return positions
    }

    public suiteTeardown(): boolean {
        const fileUpdates: Map<string, TestUpdate[]> = new Map()

        for (const update of this.updates) {
            const updates = fileUpdates.get(update.filePath) ?? []
            updates.push(update)
            fileUpdates.set(update.filePath, updates)
        }

        for (const [filePath, updates] of fileUpdates.entries()) {
            TestParser.updateExpectedBatch(filePath, updates)
        }

        return true
    }

    protected shouldRunTest(testName: string): boolean {
        const testPattern = process.env["TON_TEST_PATTERN"]
        if (testPattern) {
            return testName.toLowerCase().includes(testPattern.toLowerCase())
        }
        return true
    }

    protected shouldRunTestFile(testFileName: string): boolean {
        const filePattern = process.env["TON_TEST_FILE"]
        if (filePattern) {
            const normalizedPattern = filePattern.replace(/\.test$/, "")
            const normalizedFileName = path.basename(testFileName, ".test")
            return normalizedFileName.toLowerCase().includes(normalizedPattern.toLowerCase())
        }
        return true
    }

    protected logTestInfo(message: string): void {
        if (process.env["TON_TEST_VERBOSE"] === "true") {
            console.log(`[${this.constructor.name}] ${message}`)
        }
    }

    public runTestsFromDirectory(directory: string): void {
        const testCasesPath = path.join(
            __dirname,
            "..",
            "..",
            "tolk",
            "testcases",
            directory,
            "*.test",
        )
        const testFiles = glob.sync(testCasesPath, {windowsPathsNoEscape: true})

        if (testFiles.length === 0) {
            throw new Error(`No test files found in ${path.dirname(testCasesPath)}`)
        }

        const filteredTestFiles = testFiles.filter(testFile => this.shouldRunTestFile(testFile))
        if (filteredTestFiles.length === 0 && process.env["TON_TEST_FILE"]) {
            return
        }

        this.logTestInfo(
            `Found ${filteredTestFiles.length} test file(s) in ${directory}${process.env["TON_TEST_FILE"] ? ` (filtered by: ${process.env["TON_TEST_FILE"]})` : ""}`,
        )

        let totalTests = 0
        let filteredTests = 0

        for (const testFile of filteredTestFiles) {
            const content = fs.readFileSync(testFile, "utf8")
            const testCases = TestParser.parseAll(content)

            this.logTestInfo(
                `Processing ${testCases.length} test case(s) from ${path.basename(testFile)}`,
            )
            totalTests += testCases.length

            for (const testCase of testCases) {
                if (this.shouldRunTest(testCase.name)) {
                    this.logTestInfo(`Running test: ${testCase.name}`)
                    this.runTest(testFile, testCase)
                    filteredTests++
                } else {
                    this.logTestInfo(`Skipping test: ${testCase.name} (filtered out)`)
                }
            }
        }

        const filterInfo = []
        if (process.env["TON_TEST_FILE"]) {
            filterInfo.push(`file: "${process.env["TON_TEST_FILE"]}"`)
        }
        if (process.env["TON_TEST_PATTERN"]) {
            filterInfo.push(`pattern: "${process.env["TON_TEST_PATTERN"]}"`)
        }

        if (filterInfo.length > 0) {
            this.logTestInfo(
                `Ran ${filteredTests} out of ${totalTests} tests (filtered by ${filterInfo.join(", ")})`,
            )
        } else {
            this.logTestInfo(`Ran all ${totalTests} tests`)
        }
    }

    protected abstract runTest(testFile: string, testCase: TestCase): void
}

async function activate(): Promise<void> {
    console.log("Activating extension...")

    const ext = vscode.extensions.getExtension("ton-core.vscode-ton")
    if (!ext) {
        throw new Error(
            "Extension not found. Make sure the extension is installed and the ID is correct (ton-core.vscode-ton)",
        )
    }

    console.log("Extension found, activating...")
    await ext.activate()

    console.log("Waiting for language server initialization...")
    await new Promise(resolve => setTimeout(resolve, 1000))

    const languages = await vscode.languages.getLanguages()
    if (!languages.includes("tolk")) {
        throw new Error("Tolk language not registered. Check package.json configuration.")
    }

    if (!ext.isActive) {
        throw new Error("Extension failed to activate")
    }

    console.log("Extension activated successfully")
}
