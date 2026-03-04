//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as fs from "node:fs/promises"
import * as path from "node:path"

import * as vscode from "vscode"

import {FileCoverageDetail} from "vscode"

import {Acton} from "./Acton"
import {TestCommand, TestMode} from "./ActonCommand"

interface TeamCityTestingStartedMessage {
    readonly name: "testingStarted"
    readonly attributes: Readonly<Record<string, never>>
}

interface TeamCityTestingFinishedMessage {
    readonly name: "testingFinished"
    readonly attributes: Readonly<Record<string, never>>
}

interface TeamCityTestSuiteStartedAttributes {
    readonly name?: string
    readonly nodeId?: string
    readonly parentNodeId?: string
    readonly nodeType?: string
    readonly locationHint?: string
}

interface TeamCityTestSuiteStartedMessage {
    readonly name: "testSuiteStarted"
    readonly attributes: Readonly<TeamCityTestSuiteStartedAttributes>
}

interface TeamCityTestSuiteFinishedAttributes {
    readonly name?: string
    readonly nodeId?: string
    readonly parentNodeId?: string
}

interface TeamCityTestSuiteFinishedMessage {
    readonly name: "testSuiteFinished"
    readonly attributes: Readonly<TeamCityTestSuiteFinishedAttributes>
}

interface TeamCityTestStartedAttributes {
    readonly name?: string
    readonly nodeId?: string
    readonly parentNodeId?: string
    readonly locationHint?: string
}

interface TeamCityTestStartedMessage {
    readonly name: "testStarted"
    readonly attributes: Readonly<TeamCityTestStartedAttributes>
}

interface TeamCityTestFinishedAttributes {
    readonly name?: string
    readonly nodeId?: string
    readonly parentNodeId?: string
    readonly duration?: string
}

interface TeamCityTestFinishedMessage {
    readonly name: "testFinished"
    readonly attributes: Readonly<TeamCityTestFinishedAttributes>
}

interface TeamCityTestFailedAttributes {
    readonly name?: string
    readonly nodeId?: string
    readonly parentNodeId?: string
    readonly duration?: string
    readonly message?: string
    readonly details?: string
    readonly expected?: string
    readonly actual?: string
}

interface TeamCityTestFailedMessage {
    readonly name: "testFailed"
    readonly attributes: Readonly<TeamCityTestFailedAttributes>
}

interface TeamCityTestIgnoredAttributes {
    readonly name?: string
    readonly nodeId?: string
    readonly parentNodeId?: string
    readonly message?: string
    readonly details?: string
}

interface TeamCityTestIgnoredMessage {
    readonly name: "testIgnored"
    readonly attributes: Readonly<TeamCityTestIgnoredAttributes>
}

type TeamCityServiceMessage =
    | TeamCityTestingStartedMessage
    | TeamCityTestingFinishedMessage
    | TeamCityTestSuiteStartedMessage
    | TeamCityTestSuiteFinishedMessage
    | TeamCityTestStartedMessage
    | TeamCityTestFinishedMessage
    | TeamCityTestFailedMessage
    | TeamCityTestIgnoredMessage

type TeamCityTestStatusMessage =
    | TeamCityTestStartedMessage
    | TeamCityTestFinishedMessage
    | TeamCityTestFailedMessage
    | TeamCityTestIgnoredMessage

export class ActonTestController implements Disposable {
    private readonly controller: vscode.TestController
    private readonly outputChannel: vscode.OutputChannel
    private readonly coverageDetails: Map<string, vscode.StatementCoverage[]> = new Map()

    public constructor() {
        this.controller = vscode.tests.createTestController("actonTests", "Acton Tests")
        this.outputChannel = vscode.window.createOutputChannel("Acton Tests")

        this.controller.createRunProfile(
            "Run",
            vscode.TestRunProfileKind.Run,
            async (request, token) => {
                await this.runHandler(request, token)
            },
            true,
        )

        const coverageProfile = this.controller.createRunProfile(
            "Coverage",
            vscode.TestRunProfileKind.Coverage,
            async (request, token) => {
                await this.runHandler(request, token, true)
            },
            true,
        )

        coverageProfile.loadDetailedCoverage = (
            _testRun,
            fileCoverage,
        ): Thenable<FileCoverageDetail[]> => {
            return Promise.resolve(this.coverageDetails.get(fileCoverage.uri.toString()) ?? [])
        }

        this.controller.resolveHandler = async item => {
            await (item ? this.discoverTestsInItem(item) : this.discoverAllTests())
        }

        vscode.workspace.onDidOpenTextDocument(e => {
            this.discoverTestsInDocument(e)
        })
        vscode.workspace.onDidChangeTextDocument(e => {
            this.discoverTestsInDocument(e.document)
        })

        const watcher = vscode.workspace.createFileSystemWatcher("**/*.test.tolk")
        watcher.onDidCreate(async uri => this.discoverTestsInFile(uri))
        watcher.onDidChange(async uri => this.discoverTestsInFile(uri))
        watcher.onDidDelete(uri => {
            this.controller.items.delete(uri.toString())
        })
    }

    private async discoverAllTests(): Promise<void> {
        const files = await vscode.workspace.findFiles("**/*.test.tolk")
        for (const file of files) {
            await this.discoverTestsInFile(file)
        }
    }

    private async discoverTestsInFile(uri: vscode.Uri): Promise<void> {
        try {
            if (uri.fsPath.includes(".acton")) {
                // skip tests in `.acton/`
                return
            }

            if (uri.fsPath.includes(".test.tolk.test.tolk")) {
                // skip temp artifacts
                return
            }

            const document = await vscode.workspace.openTextDocument(uri)
            this.discoverTestsInDocument(document)
        } catch (error) {
            console.error(`Failed to discover tests in ${uri.fsPath}`, error)
        }
    }

    private discoverTestsInDocument(document: vscode.TextDocument): void {
        if (!document.uri.fsPath.endsWith(".test.tolk")) {
            return
        }

        const fileItem = this.getOrCreateFile(document.uri)
        const text = document.getText()
        const testRegex = /get\s+fun\s+(`?test[\s_-][^(`]+`?)\s*\(/gi
        let match: RegExpExecArray | null

        const currentTestIds: Set<string> = new Set()

        while ((match = testRegex.exec(text)) !== null) {
            const name = match[1]
            const cleanName = name.startsWith("`") && name.endsWith("`") ? name.slice(1, -1) : name
            const id = `${document.uri.toString()}:${cleanName}`
            currentTestIds.add(id)

            let testItem = fileItem.children.get(id)
            if (!testItem) {
                testItem = this.controller.createTestItem(id, cleanName, document.uri)
                fileItem.children.add(testItem)
            }

            const startPos = document.positionAt(match.index)
            const endPos = document.positionAt(match.index + match[0].length)
            testItem.range = new vscode.Range(startPos, endPos)
        }

        fileItem.children.forEach(child => {
            if (!currentTestIds.has(child.id)) {
                fileItem.children.delete(child.id)
            }
        })

        if (fileItem.children.size === 0) {
            this.controller.items.delete(fileItem.id)
        }
    }

    private getOrCreateFile(uri: vscode.Uri): vscode.TestItem {
        const existing = this.controller.items.get(uri.toString())
        if (existing) {
            return existing
        }

        const fileItem = this.controller.createTestItem(
            uri.toString(),
            path.basename(uri.fsPath),
            uri,
        )
        fileItem.canResolveChildren = true
        this.controller.items.add(fileItem)
        return fileItem
    }

    private async discoverTestsInItem(item: vscode.TestItem): Promise<void> {
        if (item.uri && item.uri.fsPath.endsWith(".test.tolk")) {
            await this.discoverTestsInFile(item.uri)
        }
    }

    private async runHandler(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
        isCoverage: boolean = false,
    ): Promise<void> {
        if (isCoverage) {
            this.coverageDetails.clear()
        }
        const run = this.controller.createTestRun(request)
        const queue: vscode.TestItem[] = []
        const seen: Set<string> = new Set()
        const excluded: Set<string> = new Set((request.exclude ?? []).map(test => test.id))

        const enqueue = (test: vscode.TestItem): void => {
            if (seen.has(test.id) || excluded.has(test.id)) {
                return
            }
            seen.add(test.id)
            queue.push(test)
        }

        if (request.include) {
            for (const test of request.include) {
                enqueue(test)
            }
            const queueByWorkingDir = await this.groupTestsByWorkingDir(queue, run, token)
            for (const [workingDir, tests] of queueByWorkingDir) {
                if (token.isCancellationRequested) {
                    break
                }

                if (tests.length === 1) {
                    const single = tests[0]
                    if (single.uri && single.id === single.uri.toString()) {
                        const commandTarget = path.relative(workingDir, single.uri.fsPath)
                        await this.runAllTestsInDirectory(
                            workingDir,
                            [single],
                            run,
                            token,
                            isCoverage,
                            commandTarget,
                        )
                    } else {
                        await this.runTestItem(single, run, token, isCoverage)
                    }
                    continue
                }

                const commandTarget = this.getSelectionRunTarget(tests, workingDir)
                await this.runAllTestsInDirectory(
                    workingDir,
                    tests,
                    run,
                    token,
                    isCoverage,
                    commandTarget,
                )
            }
            run.end()
            return
        }

        this.controller.items.forEach(test => {
            enqueue(test)
        })
        const queueByWorkingDir = await this.groupTestsByWorkingDir(queue, run, token)

        for (const [workingDir, tests] of queueByWorkingDir) {
            if (token.isCancellationRequested) {
                break
            }

            await this.runAllTestsInDirectory(workingDir, tests, run, token, isCoverage)
        }

        run.end()
    }

    private async groupTestsByWorkingDir(
        queue: readonly vscode.TestItem[],
        run: vscode.TestRun,
        token: vscode.CancellationToken,
    ): Promise<Map<string, vscode.TestItem[]>> {
        const grouped: Map<string, vscode.TestItem[]> = new Map()

        for (const test of queue) {
            if (token.isCancellationRequested) {
                break
            }

            const uri = test.uri
            if (!uri) {
                run.skipped(test)
                continue
            }

            const tomlUri = await Acton.getInstance().findActonToml(uri)
            const workingDir = tomlUri ? path.dirname(tomlUri.fsPath) : path.dirname(uri.fsPath)
            const tests = grouped.get(workingDir) ?? []
            tests.push(test)
            grouped.set(workingDir, tests)
        }

        return grouped
    }

    private async runTestItem(
        item: vscode.TestItem,
        run: vscode.TestRun,
        token: vscode.CancellationToken,
        isCoverage: boolean = false,
    ): Promise<void> {
        if (token.isCancellationRequested) {
            return
        }

        run.started(item)

        const uri = item.uri
        if (!uri) {
            run.skipped(item)
            return
        }

        const tomlUri = await Acton.getInstance().findActonToml(uri)
        const workingDir = tomlUri ? path.dirname(tomlUri.fsPath) : path.dirname(uri.fsPath)
        const relativePath = path.relative(workingDir, uri.fsPath)

        const coverageFile = isCoverage ? path.join(workingDir, "lcov.info") : ""
        const command =
            item.children.size > 0
                ? new TestCommand(
                      TestMode.FILE,
                      relativePath,
                      "",
                      false,
                      isCoverage,
                      "lcov",
                      coverageFile,
                  )
                : new TestCommand(
                      TestMode.FUNCTION,
                      relativePath,
                      item.label,
                      false,
                      isCoverage,
                      "lcov",
                      coverageFile,
                  )

        let teamCityFailureMessage: string | undefined
        let teamCityFailureLocation: vscode.Location | undefined
        const outputProcessor = this.createOutputProcessor(run, item, message => {
            if (message.name !== "testFailed" || teamCityFailureMessage) {
                return
            }

            const details = message.attributes.details ?? ""
            teamCityFailureMessage =
                message.attributes.message ?? this.extractErrorMessage(details || "Test failed")
            teamCityFailureLocation = this.extractErrorLocation(details, workingDir)
        })

        try {
            const {exitCode, stdout, stderr} = await Acton.getInstance().spawn(
                command,
                workingDir,
                undefined,
                data => {
                    outputProcessor.handleChunk(data)
                },
            )
            outputProcessor.flush()

            if (exitCode === 0) {
                run.passed(item)
                if (isCoverage && coverageFile) {
                    await this.processCoverage(coverageFile, run, workingDir)
                }
            } else {
                const cleanMessage = this.stripTeamCityMessages(
                    this.stripAnsi(`${stdout}\n${stderr}`),
                ).trim()
                const displayMessage =
                    teamCityFailureMessage ??
                    this.extractErrorMessage(
                        cleanMessage || "Test failed (no TeamCity details received)",
                    )
                const message = new vscode.TestMessage(displayMessage)
                message.location = teamCityFailureLocation
                run.failed(item, message)
            }
        } catch (error) {
            outputProcessor.flush()
            run.failed(item, new vscode.TestMessage(String(error)))
        }
    }

    private async runAllTestsInDirectory(
        workingDir: string,
        roots: vscode.TestItem[],
        run: vscode.TestRun,
        token: vscode.CancellationToken,
        isCoverage: boolean = false,
        commandTarget: string = "",
    ): Promise<void> {
        if (token.isCancellationRequested || roots.length === 0) {
            return
        }

        const tests = this.collectLeafTests(roots)
        const resolvedTestIds: Set<string> = new Set()
        const failedTestIds: Set<string> = new Set()
        const testsById: Map<string, vscode.TestItem> = new Map(
            tests.map(test => [test.id, test] as const),
        )
        const testsByKey: Map<string, vscode.TestItem[]> = new Map()
        const testsByName: Map<string, vscode.TestItem[]> = new Map()
        const nodeToTestId: Map<string, string> = new Map()
        const suiteNodeToFileHint: Map<string, string> = new Map()

        const registerToMap = (
            map: Map<string, vscode.TestItem[]>,
            key: string,
            test: vscode.TestItem,
        ): void => {
            const entry = map.get(key) ?? []
            entry.push(test)
            map.set(key, entry)
        }

        for (const test of tests) {
            for (const key of this.getLookupKeys(test, workingDir)) {
                registerToMap(testsByKey, key, test)
            }
            registerToMap(testsByName, this.normalizeTestName(test.label), test)
        }

        const getUnresolvedByKey = (key: string): vscode.TestItem | undefined => {
            return testsByKey.get(key)?.find(test => !resolvedTestIds.has(test.id))
        }

        const resolveTestByHint = (
            testName: string | undefined,
            fileHint: string | undefined,
        ): vscode.TestItem | undefined => {
            if (!testName) {
                return undefined
            }

            const normalizedName = this.normalizeTestName(testName)
            for (const fileKey of this.normalizeFileHint(fileHint, workingDir)) {
                const candidate = getUnresolvedByKey(`${fileKey}::${normalizedName}`)
                if (candidate) {
                    return candidate
                }
            }

            const byName = (testsByName.get(normalizedName) ?? []).filter(
                test => !resolvedTestIds.has(test.id),
            )
            return byName.length === 1 ? byName[0] : undefined
        }

        const markPassed = (test: vscode.TestItem): void => {
            if (resolvedTestIds.has(test.id)) {
                return
            }
            run.passed(test)
            resolvedTestIds.add(test.id)
        }

        const markFailed = (
            test: vscode.TestItem,
            messageText: string,
            location?: vscode.Location,
        ): void => {
            if (resolvedTestIds.has(test.id)) {
                return
            }
            const message = new vscode.TestMessage(messageText)
            message.location = location
            run.failed(test, message)
            failedTestIds.add(test.id)
            resolvedTestIds.add(test.id)
        }

        const markSkipped = (test: vscode.TestItem): void => {
            if (resolvedTestIds.has(test.id)) {
                return
            }
            run.skipped(test)
            resolvedTestIds.add(test.id)
        }

        const resolveTestFromServiceMessage = (
            message: TeamCityTestStatusMessage,
        ): vscode.TestItem | undefined => {
            const nodeId = message.attributes.nodeId
            if (nodeId) {
                const mapped = nodeToTestId.get(nodeId)
                if (mapped) {
                    return testsById.get(mapped)
                }
            }

            const parentNodeId = message.attributes.parentNodeId
            const fileHint = parentNodeId ? suiteNodeToFileHint.get(parentNodeId) : undefined
            const test = resolveTestByHint(message.attributes.name, fileHint)
            if (test && nodeId) {
                nodeToTestId.set(nodeId, test.id)
            }
            return test
        }

        for (const test of tests) {
            run.started(test)
        }

        const coverageFile = isCoverage ? path.join(workingDir, "lcov.info") : ""
        const command = new TestCommand(
            TestMode.DIRECTORY,
            commandTarget,
            "",
            false,
            isCoverage,
            "lcov",
            coverageFile,
        )

        const outputProcessor = this.createOutputProcessor(run, undefined, message => {
            switch (message.name) {
                case "testingStarted":
                case "testingFinished":
                case "testSuiteFinished": {
                    break
                }
                case "testSuiteStarted": {
                    const nodeId = message.attributes.nodeId
                    if (nodeId) {
                        const locationHint = message.attributes.locationHint
                        const suiteName = message.attributes.name
                        const fileHint = this.extractTeamCityFileHint(locationHint, suiteName)
                        if (fileHint) {
                            suiteNodeToFileHint.set(nodeId, fileHint)
                        }
                    }
                    break
                }
                case "testStarted": {
                    const nodeId = message.attributes.nodeId
                    if (!nodeId) {
                        break
                    }
                    const parentNodeId = message.attributes.parentNodeId
                    const fileHint = parentNodeId
                        ? suiteNodeToFileHint.get(parentNodeId)
                        : undefined
                    const test = resolveTestByHint(message.attributes.name, fileHint)
                    if (test) {
                        nodeToTestId.set(nodeId, test.id)
                    }
                    break
                }
                case "testFailed": {
                    const test = resolveTestFromServiceMessage(message)
                    if (!test) {
                        break
                    }
                    const details = message.attributes.details ?? ""
                    const messageText =
                        message.attributes.message ??
                        this.extractErrorMessage(details || "Test failed")
                    const location = this.extractErrorLocation(details, workingDir)
                    markFailed(test, messageText, location)
                    break
                }
                case "testIgnored": {
                    const test = resolveTestFromServiceMessage(message)
                    if (test) {
                        markSkipped(test)
                    }
                    break
                }
                case "testFinished": {
                    const test = resolveTestFromServiceMessage(message)
                    if (test && !failedTestIds.has(test.id)) {
                        markPassed(test)
                    }
                    break
                }
            }
        })

        try {
            const {exitCode, stdout, stderr} = await Acton.getInstance().spawn(
                command,
                workingDir,
                undefined,
                data => {
                    outputProcessor.handleChunk(data)
                },
            )
            outputProcessor.flush()

            const cleanOutput = this.stripTeamCityMessages(
                this.stripAnsi(`${stdout}\n${stderr}`),
            ).trim()
            const fallbackMessageText = this.extractErrorMessage(
                cleanOutput || "Test failed (no TeamCity details received)",
            )
            const hasTeamCityResults = resolvedTestIds.size > 0

            for (const test of tests) {
                if (resolvedTestIds.has(test.id)) {
                    continue
                }

                if (exitCode === 0) {
                    if (hasTeamCityResults) {
                        markFailed(test, "TeamCity did not report final status for this test")
                    } else {
                        markFailed(test, "No TeamCity test events were received")
                    }
                } else {
                    markFailed(
                        test,
                        hasTeamCityResults
                            ? `TeamCity did not report final status for this test\n${fallbackMessageText}`
                            : fallbackMessageText,
                    )
                }
            }

            if (isCoverage && coverageFile) {
                await this.processCoverage(coverageFile, run, workingDir)
            }
        } catch (error) {
            outputProcessor.flush()
            for (const test of tests) {
                if (!resolvedTestIds.has(test.id)) {
                    run.failed(test, new vscode.TestMessage(String(error)))
                    resolvedTestIds.add(test.id)
                }
            }
        }
    }

    private collectLeafTests(items: vscode.TestItem[]): vscode.TestItem[] {
        const queue = [...items]
        const result: vscode.TestItem[] = []
        const seen: Set<string> = new Set()

        while (queue.length > 0) {
            const item = queue.shift()
            if (!item || seen.has(item.id)) {
                continue
            }
            seen.add(item.id)

            if (item.children.size === 0) {
                result.push(item)
                continue
            }

            item.children.forEach(child => {
                queue.push(child)
            })
        }

        return result
    }

    private getSelectionRunTarget(items: readonly vscode.TestItem[], workingDir: string): string {
        const directories = items
            .map(item => item.uri?.fsPath)
            .filter((value): value is string => typeof value === "string")
            .map(filePath => path.dirname(filePath))

        if (directories.length === 0) {
            return ""
        }

        let commonDirectory = directories[0]
        for (const dir of directories.slice(1)) {
            commonDirectory = this.getCommonDirectory(commonDirectory, dir)
        }

        if (!commonDirectory) {
            return ""
        }

        const relative = path.relative(workingDir, commonDirectory).replace(/\\/g, "/")
        if (relative === "" || relative === ".") {
            return ""
        }
        return relative
    }

    private getCommonDirectory(left: string, right: string): string {
        const leftNormalized = path.resolve(left)
        const rightNormalized = path.resolve(right)
        let current = leftNormalized

        for (;;) {
            const relative = path.relative(current, rightNormalized)
            const isInside =
                relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
            if (isInside) {
                return current
            }

            const parent = path.dirname(current)
            if (parent === current) {
                return ""
            }
            current = parent
        }
    }

    private getLookupKeys(item: vscode.TestItem, workingDir: string): string[] {
        const uri = item.uri
        if (!uri) {
            return []
        }

        const normalizedName = this.normalizeTestName(item.label)
        const absoluteFile = path.normalize(uri.fsPath).replace(/\\/g, "/").toLowerCase()
        const relativeFile = path.relative(workingDir, uri.fsPath).replace(/\\/g, "/").toLowerCase()
        const baseName = path.basename(uri.fsPath).toLowerCase()

        return [
            `${relativeFile}::${normalizedName}`,
            `${absoluteFile}::${normalizedName}`,
            `${baseName}::${normalizedName}`,
        ]
    }

    private normalizeFileHint(fileHint: string | undefined, workingDir: string): string[] {
        if (!fileHint || fileHint.trim() === "") {
            return []
        }

        const normalized = path.normalize(fileHint.trim())
        const absolutePath = path.isAbsolute(normalized)
            ? normalized
            : path.join(workingDir, normalized)

        const absoluteFile = absolutePath.replace(/\\/g, "/").toLowerCase()
        const relativeFile = path
            .relative(workingDir, absolutePath)
            .replace(/\\/g, "/")
            .toLowerCase()
        const baseName = path.basename(normalized).toLowerCase()

        return [absoluteFile, relativeFile, baseName]
    }

    private createOutputProcessor(
        run: vscode.TestRun,
        outputItem?: vscode.TestItem,
        onTeamCityMessage?: (message: TeamCityServiceMessage) => void,
    ): {handleChunk: (data: string) => void; flush: () => void} {
        let buffer = ""

        const emitVisibleOutput = (text: string): void => {
            if (text === "") {
                return
            }
            this.outputChannel.append(text)
            // Test runner output expects CRLF for newlines to be treated as a terminal
            run.appendOutput(text.replace(/\r?\n/g, "\r\n"), undefined, outputItem)
        }

        const processLine = (line: string, hasTrailingNewline: boolean): void => {
            const normalizedLine = line.endsWith("\r") ? line.slice(0, -1) : line
            const trimmed = normalizedLine.trimStart()
            if (trimmed.startsWith("##teamcity[")) {
                const teamCityMessage = this.parseTeamCityMessage(trimmed)
                if (teamCityMessage) {
                    onTeamCityMessage?.(teamCityMessage)
                }
                return
            }

            emitVisibleOutput(normalizedLine + (hasTrailingNewline ? "\n" : ""))
        }

        return {
            handleChunk: (data: string): void => {
                buffer += data

                for (;;) {
                    const newlineIndex = buffer.indexOf("\n")
                    if (newlineIndex === -1) {
                        break
                    }

                    const line = buffer.slice(0, newlineIndex)
                    buffer = buffer.slice(newlineIndex + 1)
                    processLine(line, true)
                }
            },
            flush: (): void => {
                if (buffer !== "") {
                    processLine(buffer, false)
                    buffer = ""
                }
            },
        }
    }

    private parseTeamCityMessage(line: string): TeamCityServiceMessage | undefined {
        if (!line.startsWith("##teamcity[") || !line.endsWith("]")) {
            return undefined
        }

        const content = line.slice("##teamcity[".length, -1)
        const nameMatch = /^(\w+)/.exec(content)
        if (!nameMatch) {
            return undefined
        }

        const name = nameMatch[1]
        const attributesRaw = content.slice(name.length).trim()
        const attributes = attributesRaw === "" ? {} : this.parseTeamCityAttributes(attributesRaw)

        return this.toTypedTeamCityMessage(name, attributes)
    }

    private toTypedTeamCityMessage(
        name: string,
        attributes: Record<string, string>,
    ): TeamCityServiceMessage | undefined {
        switch (name) {
            case "testingStarted": {
                return {name, attributes: {}}
            }
            case "testingFinished": {
                return {name, attributes: {}}
            }
            case "testSuiteStarted": {
                return {name, attributes}
            }
            case "testSuiteFinished": {
                return {name, attributes}
            }
            case "testStarted": {
                return {name, attributes}
            }
            case "testFinished": {
                return {name, attributes}
            }
            case "testFailed": {
                return {name, attributes}
            }
            case "testIgnored": {
                return {name, attributes}
            }
            default: {
                return undefined
            }
        }
    }

    private parseTeamCityAttributes(raw: string): Record<string, string> {
        const attributes: Record<string, string> = {}
        let i = 0

        while (i < raw.length) {
            while (i < raw.length && raw[i] === " ") {
                i++
            }
            if (i >= raw.length) {
                break
            }

            const keyStart = i
            while (i < raw.length && /\w/.test(raw[i])) {
                i++
            }
            const key = raw.slice(keyStart, i)

            if (!key || raw[i] !== "=" || raw[i + 1] !== "'") {
                break
            }

            i += 2
            let value = ""

            while (i < raw.length) {
                const ch = raw[i]
                if (ch === "|") {
                    if (i + 1 < raw.length) {
                        value += raw.slice(i, i + 2)
                        i += 2
                        continue
                    }
                    value += ch
                    i++
                    continue
                }
                if (ch === "'") {
                    i++
                    break
                }

                value += ch
                i++
            }

            attributes[key] = this.decodeTeamCityValue(value)
        }

        return attributes
    }

    private decodeTeamCityValue(value: string): string {
        let decoded = ""

        for (let i = 0; i < value.length; i++) {
            const ch = value[i]
            if (ch !== "|") {
                decoded += ch
                continue
            }

            if (i + 1 >= value.length) {
                decoded += ch
                continue
            }

            const escaped = value[i + 1]
            i++

            switch (escaped) {
                case "n": {
                    decoded += "\n"
                    break
                }
                case "r": {
                    decoded += "\r"
                    break
                }
                case "'": {
                    decoded += "'"
                    break
                }
                case "[": {
                    decoded += "["
                    break
                }
                case "]": {
                    decoded += "]"
                    break
                }
                case "|": {
                    decoded += "|"
                    break
                }
                default: {
                    decoded += escaped
                    break
                }
            }
        }

        return decoded
    }

    private extractTeamCityFileHint(
        locationHint: string | undefined,
        suiteName: string | undefined,
    ): string | undefined {
        if (locationHint) {
            try {
                const uri = vscode.Uri.parse(locationHint)
                if (uri.scheme === "file") {
                    return uri.fsPath
                }
            } catch {
                // ignore parse errors and fallback to suite name
            }
        }

        return suiteName
    }

    private normalizeTestName(name: string): string {
        return name
            .replace(/`/g, "")
            .replace(/^\s*test[\s_-]+/i, "")
            .trim()
            .toLowerCase()
    }

    private stripAnsi(text: string): string {
        return text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    }

    private stripTeamCityMessages(text: string): string {
        return text
            .split(/\r?\n/)
            .filter(line => !line.trimStart().startsWith("##teamcity["))
            .join("\n")
    }

    private async processCoverage(
        coverageFile: string,
        run: vscode.TestRun,
        workingDir: string,
    ): Promise<void> {
        try {
            const content = await fs.readFile(coverageFile, "utf8")
            const files = this.parseLcov(content)

            for (const fileData of files) {
                const absolutePath = path.isAbsolute(fileData.file)
                    ? fileData.file
                    : path.join(workingDir, fileData.file)
                const uri = vscode.Uri.file(absolutePath)

                const statementCoverage: vscode.StatementCoverage[] = fileData.lines.map(line => {
                    return new vscode.StatementCoverage(
                        line.count,
                        new vscode.Range(line.line - 1, 0, line.line - 1, 0),
                    )
                })

                this.coverageDetails.set(uri.toString(), statementCoverage)

                const coveredLines = fileData.lines.filter(l => l.count > 0).length
                const totalLines = fileData.lines.length

                const fileCoverage = new vscode.FileCoverage(
                    uri,
                    new vscode.TestCoverageCount(coveredLines, totalLines),
                )

                run.addCoverage(fileCoverage)
            }
        } catch (error) {
            console.error("Failed to process coverage", error)
        }
    }

    private parseLcov(content: string): {file: string; lines: {line: number; count: number}[]}[] {
        const files: {file: string; lines: {line: number; count: number}[]}[] = []
        let currentFile: {file: string; lines: {line: number; count: number}[]} | null = null

        for (const line of content.split(/\r?\n/)) {
            if (line.startsWith("SF:")) {
                currentFile = {file: line.slice(3).trim(), lines: []}
            } else if (line.startsWith("DA:") && currentFile) {
                const parts = line.slice(3).split(",")
                if (parts.length >= 2) {
                    const lineNum = Number.parseInt(parts[0], 10)
                    const count = Number.parseInt(parts[1], 10)
                    if (!Number.isNaN(lineNum) && !Number.isNaN(count)) {
                        currentFile.lines.push({line: lineNum, count})
                    }
                }
            } else if (line.startsWith("end_of_record") && currentFile) {
                files.push(currentFile)
                currentFile = null
            }
        }
        return files
    }

    private extractErrorLocation(
        cleanMessage: string,
        workingDir?: string,
    ): vscode.Location | undefined {
        const locationMatch = /(?:at\s+)?(.+):(\d+):(\d+)\s*$/m.exec(cleanMessage)
        if (!locationMatch) return undefined

        const filePath = locationMatch[1].trim()
        const line = Number.parseInt(locationMatch[2], 10)
        const column = Number.parseInt(locationMatch[3], 10)

        if (!Number.isNaN(line) && !Number.isNaN(column)) {
            const absolutePath = path.isAbsolute(filePath)
                ? filePath
                : workingDir
                  ? path.join(workingDir, filePath)
                  : undefined

            if (!absolutePath) {
                return undefined
            }

            return new vscode.Location(
                vscode.Uri.file(absolutePath),
                new vscode.Range(
                    new vscode.Position(line - 1, Math.max(0, column - 1)),
                    new vscode.Position(line - 1, column),
                ),
            )
        }

        return undefined
    }

    private extractErrorMessage(cleanMessage: string): string {
        const errorMatch = /Error:\s*(.+)/.exec(cleanMessage)
        if (errorMatch) {
            return errorMatch[1].trim()
        }
        return cleanMessage
    }

    public dispose(): void {
        this.controller.dispose()
        this.outputChannel.dispose()
    }

    public [Symbol.dispose](): void {
        this.dispose()
    }
}
