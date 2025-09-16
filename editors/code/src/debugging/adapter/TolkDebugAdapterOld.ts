import {
    Breakpoint,
    InitializedEvent,
    LoggingDebugSession,
    OutputEvent,
    StoppedEvent,
    Thread,
    StackFrame,
    TerminatedEvent,
    Source,
    Scope,
} from "@vscode/debugadapter"
import {DebugProtocol} from "@vscode/debugprotocol"
import * as path from "node:path"
import {LaunchRequestArguments} from "./types"
import {createTraceInfoFromVmLogs} from "./trace-utils"
import {
    StackElement,
    TraceInfo,
    SourceMapEntry,
    SourceMapVariable,
    Step,
} from "ton-assembly/dist/trace"

// eslint-disable-next-line functional/type-declaration-immutability
interface NestedVariable {
    readonly name: string
    readonly value: string
    readonly type?: string
    readonly stackValue?: StackElement
    children?: NestedVariable[]
}

export class TolkDebugAdapterOld extends LoggingDebugSession {
    private static readonly THREAD_ID: number = 1
    private currentStep: number = 0
    private currentEntryIndex: number = 0
    private traceInfo: TraceInfo | undefined
    private launchArgs: LaunchRequestArguments | undefined

    private readonly variableHandles: Map<number, StackElement[] | NestedVariable[]> = new Map()
    private nextVariableHandle: number = 1000

    private readonly breakPoints: Map<string, DebugProtocol.SourceBreakpoint[]> = new Map()

    private readonly lineToStepsMap: Map<string, Map<number, number[]>> = new Map()

    public constructor() {
        super("assembly-debug.log")
        this.setDebuggerColumnsStartAt1(true)
    }

    private getPrimarySourceMapEntry(step: Step): SourceMapEntry | undefined {
        if (step.sourceMapEntries.length === 0) {
            return undefined
        }

        return step.sourceMapEntries[this.currentEntryIndex] ?? step.sourceMapEntries[0]
    }

    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    protected override initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments,
    ): void {
        response.body = response.body ?? {}

        response.body.supportsConfigurationDoneRequest = true
        response.body.supportsStepBack = true
        response.body.supportsRestartRequest = true
        response.body.supportsStepInTargetsRequest = true

        response.body.supportsInstructionBreakpoints = true
        response.body.supportsConditionalBreakpoints = false
        response.body.supportsHitConditionalBreakpoints = false
        response.body.supportsLogPoints = false

        this.sendResponse(response)
        this.sendEvent(new InitializedEvent())
    }

    /**
     * Called at the end of the configuration sequence.
     * Indicates that all configuration is done and the debug adapter can
     * continue processing requests.
     */
    protected override configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        args: DebugProtocol.ConfigurationDoneArguments,
    ): void {
        super.configurationDoneRequest(response, args)
    }

    protected override launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: LaunchRequestArguments,
        request?: DebugProtocol.Request,
    ): void {
        this.launchArgs = args
        this.log(`Launch arguments: ${JSON.stringify(args)}`)

        if (!args.code || !args.vmLogs) {
            this.sendErrorResponse(
                response,
                1001,
                "code and vmLogs must be provided in launch configuration.",
            )
            return
        }

        try {
            this.traceInfo = createTraceInfoFromVmLogs(
                args.vmLogs,
                args.code,
                args.sourceMap?.sourcemap,
                args.sourceMap?.mappingInfo,
            )
            this.log(`Loaded trace info with ${this.traceInfo.steps.length} steps.`)

            this.buildLineToStepsMap()

            // Find first Tolk step or fallback to step 0
            this.currentStep = this.findFirstTolkStep()
            this.currentEntryIndex = 0
            this.sendResponse(response)

            if (args.stopOnEntry === false) {
                this.continue()
            } else {
                this.sendEvent(new StoppedEvent("entry", TolkDebugAdapterOld.THREAD_ID))
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.log(`Error loading trace info: ${errorMessage}`)
            this.sendErrorResponse(response, 1002, `Failed to load trace info: ${errorMessage}`)
        }
    }

    protected override threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [new Thread(TolkDebugAdapterOld.THREAD_ID, "main thread")],
        }
        this.sendResponse(response)
    }

    private clearVariableHandles(): void {
        this.variableHandles.clear()
        this.nextVariableHandle = 1000
    }

    private buildVariableTree(
        variables: readonly SourceMapVariable[],
        stackElements: readonly StackElement[],
    ): NestedVariable[] {
        const root: Map<string, NestedVariable> = new Map()

        variables.forEach((variable, index) => {
            if (variable.name.startsWith("'") || variable.name.startsWith("lazy")) {
                return
            }

            const stackValue = stackElements.at(stackElements.length - 1 - index)
            const parts = variable.name.split(".")

            if (parts.length === 1) {
                root.set(variable.name, {
                    name: variable.name,
                    value:
                        variable.value ??
                        (stackValue ? this.formatStackElement(stackValue) : "Available in scope"),
                    type: variable.type,
                    stackValue,
                })
            } else {
                const parentName = parts[0]
                const childName = parts.slice(1).join(".")

                if (!root.has(parentName)) {
                    root.set(parentName, {
                        name: parentName,
                        value: `{...}`,
                        children: [],
                    })
                }

                const parent = root.get(parentName)
                if (!parent) {
                    return
                }
                if (!parent.children) {
                    parent.children = []
                }

                parent.children.push({
                    name: childName,
                    value:
                        variable.value ??
                        (stackValue ? this.formatStackElement(stackValue) : "Available in scope"),
                    type: variable.type,
                    stackValue,
                })
            }
        })

        return [...root.values()]
    }

    private formatNestedVariables(
        nestedVars: NestedVariable[],
        variables: DebugProtocol.Variable[],
    ): void {
        nestedVars.forEach(nestedVar => {
            let variableHandle = 0

            if (nestedVar.children && nestedVar.children.length > 0) {
                variableHandle = this.nextVariableHandle++
                this.variableHandles.set(variableHandle, nestedVar.children)
            } else if (nestedVar.stackValue && nestedVar.stackValue.$ === "Tuple") {
                if (nestedVar.stackValue.elements.length > 0) {
                    variableHandle = this.nextVariableHandle++
                    this.variableHandles.set(variableHandle, nestedVar.stackValue.elements)
                }
            }

            variables.push({
                name: nestedVar.name,
                value: nestedVar.value,
                variablesReference: variableHandle,
                type: nestedVar.type,
            })
        })
    }

    protected override stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments,
    ): void {
        this.clearVariableHandles()

        if (
            !this.traceInfo ||
            !this.launchArgs?.code ||
            this.currentStep >= this.traceInfo.steps.length
        ) {
            response.body = {stackFrames: [], totalFrames: 0}
            this.sendResponse(response)
            return
        }

        const currentStepData = this.traceInfo.steps[this.currentStep]
        if (currentStepData.sourceMapEntries.length === 0) {
            response.body = {stackFrames: [], totalFrames: 0}
            this.sendResponse(response)
            return
        }
        const stackFrames: StackFrame[] = []

        let source: Source
        let line: number
        let column: number

        const primaryEntry = this.getPrimarySourceMapEntry(currentStepData)
        if (primaryEntry && this.launchArgs.sourceMap?.sourcemap) {
            let filepath = primaryEntry.file
            if (filepath === "") {
                filepath = this.traceInfo.steps[this.currentStep + 1].sourceMapEntries[0]?.file
            }
            filepath = filepath.replace(
                "@stdlib/",
                "/Users/petrmakhnev/tolk-tests/simple-counter/node_modules/@ton/tolk-js/dist/tolk-stdlib/",
            )

            source = new Source(path.basename(filepath), this.convertDebuggerPathToClient(filepath))
            line = primaryEntry.line
            column = primaryEntry.pos + 1
        } else {
            const programPath = this.launchArgs.program ?? "assembly.tasm"
            source = new Source(
                path.basename(programPath),
                this.convertDebuggerPathToClient(programPath),
            )
            line = (currentStepData.loc?.line ?? 0) + 1
            column = 1
        }

        this.log(
            `Stack frame: ${source.path}, Line: ${line}, Col: ${column}, Step: ${this.currentStep + 1}, Entry: ${this.currentEntryIndex + 1}/${currentStepData.sourceMapEntries.length}${primaryEntry ? ` (Tolk: ${primaryEntry.func})` : ""}`,
            "verbose",
        )

        const frameTitle = primaryEntry
            ? `${primaryEntry.func}:${currentStepData.instructionName} (Step ${this.currentStep + 1})`
            : `${currentStepData.instructionName} (Step ${this.currentStep + 1})`

        stackFrames.push(new StackFrame(0, frameTitle, source, line, column))

        response.body = {
            stackFrames: stackFrames,
            totalFrames: 1,
        }
        this.sendResponse(response)
    }

    protected override scopesRequest(
        response: DebugProtocol.ScopesResponse,
        args: DebugProtocol.ScopesArguments,
    ): void {
        const scopes: Scope[] = []

        if (this.traceInfo && this.currentStep < this.traceInfo.steps.length) {
            const currentStep = this.traceInfo.steps[this.currentStep]
            const primaryEntry = this.getPrimarySourceMapEntry(currentStep)
            if (primaryEntry?.vars.length) {
                const scope: DebugProtocol.Scope = {
                    name: "Tolk Variables",
                    variablesReference: 1,
                    expensive: false,
                    presentationHint: "locals",
                }
                scopes.push(scope)
            }
        }

        scopes.push(new Scope("Stack", 2, false))

        response.body = {scopes}
        this.sendResponse(response)
    }

    protected override variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments,
        request?: DebugProtocol.Request,
    ): void {
        const variables: DebugProtocol.Variable[] = []
        const ref = args.variablesReference

        if (ref === 2) {
            if (this.traceInfo && this.currentStep < this.traceInfo.steps.length) {
                const elementsToFormat = this.traceInfo.steps[this.currentStep].stack
                this.formatStackVariables(elementsToFormat, variables)
            }
        } else if (ref === 1) {
            if (this.traceInfo && this.currentStep < this.traceInfo.steps.length) {
                const currentStep = this.traceInfo.steps[this.currentStep]
                const elementsToFormat = this.traceInfo.steps[this.currentStep].stack
                const primaryEntry = this.getPrimarySourceMapEntry(currentStep)
                if (primaryEntry?.vars) {
                    const vars = [...primaryEntry.vars].reverse()

                    const variableTree = this.buildVariableTree(vars, elementsToFormat)
                    this.formatNestedVariables(variableTree, variables)
                }
            }
        } else {
            const elementsToFormat = this.variableHandles.get(ref)
            if (elementsToFormat) {
                if (Array.isArray(elementsToFormat) && elementsToFormat.length > 0) {
                    const firstElement = elementsToFormat[0]
                    if ("name" in firstElement && "value" in firstElement) {
                        this.formatNestedVariables(elementsToFormat as NestedVariable[], variables)
                    } else {
                        this.formatStackVariables(elementsToFormat as StackElement[], variables)
                    }
                }
            }
        }

        response.body = {variables}
        this.sendResponse(response)
    }

    private formatStackVariables(
        elementsToFormat: readonly StackElement[],
        variables: DebugProtocol.Variable[],
    ): void {
        ;[...elementsToFormat].reverse().forEach((element, index) => {
            let variableHandle = 0
            let displayValue = this.formatStackElement(element)

            if (element.$ === "Tuple") {
                if (element.elements.length > 0) {
                    variableHandle = this.nextVariableHandle++
                    this.variableHandles.set(variableHandle, element.elements)
                    displayValue = `Tuple[${element.elements.length}]`
                } else {
                    displayValue = `Tuple[0]`
                }
            }

            variables.push({
                name: `[${index}]`,
                value: displayValue,
                variablesReference: variableHandle,
                type: element.$,
            })
        })
    }

    protected override continueRequest(
        response: DebugProtocol.ContinueResponse,
        args: DebugProtocol.ContinueArguments,
    ): void {
        this.continue()
        this.sendResponse(response)
    }

    protected override nextRequest(
        response: DebugProtocol.NextResponse,
        args: DebugProtocol.NextArguments,
    ): void {
        if (this.traceInfo === undefined) {
            this.sendErrorResponse(response, 1003, "No trace info loaded.")
            return
        }

        this.log("next request received")

        // First check if there are more entries in current step
        const currentStepData = this.traceInfo.steps[this.currentStep]
        if (
            currentStepData.sourceMapEntries.length > 0 &&
            this.currentEntryIndex < currentStepData.sourceMapEntries.length - 1
        ) {
            this.log("find next entry for current step")

            // Move to next entry in current step
            this.currentEntryIndex++
            this.sendResponse(response)
            this.sendEvent(new StoppedEvent("step", TolkDebugAdapterOld.THREAD_ID))
            return
        }

        this.log("need to find next step")

        // No more entries in current step (or no entries at all), find next step
        const nextStep = this.findNextTolkStep(false)

        if (nextStep >= 0) {
            this.currentStep = nextStep
            this.currentEntryIndex = 0
            this.clearVariableHandles()
            this.sendResponse(response)
            this.sendEvent(new StoppedEvent("step", TolkDebugAdapterOld.THREAD_ID))
        } else {
            this.currentStep = this.traceInfo.steps.length - 1
            this.currentEntryIndex = 0
            this.sendResponse(response)
            this.sendEvent(new TerminatedEvent())
        }
    }

    protected override stepInRequest(
        response: DebugProtocol.StepInResponse,
        args: DebugProtocol.StepInArguments,
    ): void {
        if (!this.traceInfo) {
            this.sendErrorResponse(response, 1003, "No trace info loaded.")
            return
        }

        // First check if there are more entries in current step
        const currentStepData = this.traceInfo.steps[this.currentStep]
        if (
            currentStepData.sourceMapEntries.length > 0 &&
            this.currentEntryIndex < currentStepData.sourceMapEntries.length - 1
        ) {
            // Move to next entry in current step
            this.currentEntryIndex++
            this.sendResponse(response)
            this.sendEvent(new StoppedEvent("step", TolkDebugAdapterOld.THREAD_ID))
            return
        }

        // No more entries in current step (or no entries at all), find next step with step into logic
        const nextStep = this.findNextTolkStep(true)

        if (nextStep >= 0) {
            this.currentStep = nextStep
            this.currentEntryIndex = 0
            this.clearVariableHandles()
            this.sendResponse(response)
            this.sendEvent(new StoppedEvent("step", TolkDebugAdapterOld.THREAD_ID))
        } else {
            this.currentStep = this.traceInfo.steps.length - 1
            this.currentEntryIndex = 0
            this.sendResponse(response)
            this.sendEvent(new TerminatedEvent())
        }
    }

    protected override stepBackRequest(
        response: DebugProtocol.StepBackResponse,
        args: DebugProtocol.StepBackArguments,
        request?: DebugProtocol.Request,
    ): void {
        if (!this.traceInfo) {
            this.sendErrorResponse(response, 1003, "No trace info loaded.")
            return
        }

        // First check if there are previous entries in current step
        const currentStepData = this.traceInfo.steps[this.currentStep]
        if (this.currentEntryIndex > 0) {
            // Move to previous entry in current step
            this.currentEntryIndex--
            this.sendResponse(response)
            this.sendEvent(new StoppedEvent("step", TolkDebugAdapterOld.THREAD_ID))
            return
        }

        // No more previous entries in current step, find previous step
        const prevStep = this.findPreviousTolkStep()

        if (prevStep >= 0) {
            this.currentStep = prevStep
            // Set to last entry in the previous step
            const prevStepData = this.traceInfo.steps[prevStep]
            this.currentEntryIndex = prevStepData.sourceMapEntries.length - 1
            this.clearVariableHandles()
            this.sendResponse(response)
            this.sendEvent(new StoppedEvent("step", TolkDebugAdapterOld.THREAD_ID))
        } else {
            this.currentStep = 0
            this.currentEntryIndex = 0
            this.sendResponse(response)
            this.sendEvent(new StoppedEvent("step", TolkDebugAdapterOld.THREAD_ID))
        }
    }

    protected override restartRequest(
        response: DebugProtocol.RestartResponse,
        args: DebugProtocol.RestartArguments,
    ): void {
        this.currentStep = 0
        this.currentEntryIndex = 0
        this.clearVariableHandles()
        this.sendResponse(response)
        this.sendEvent(new StoppedEvent("entry", TolkDebugAdapterOld.THREAD_ID))
    }

    protected override disconnectRequest(
        response: DebugProtocol.DisconnectResponse,
        args: DebugProtocol.DisconnectArguments,
        request?: DebugProtocol.Request,
    ): void {
        this.log("Disconnect request received.")
        super.disconnectRequest(response, args, request)
    }

    private log(
        message: string,
        category: "console" | "stdout" | "stderr" | "telemetry" | "verbose" = "console",
    ): void {
        this.sendEvent(new OutputEvent(`${message}\n`, category))
    }

    private formatStackElement(element: StackElement): string {
        switch (element.$) {
            case "Null": {
                return `()`
            }
            case "Integer": {
                return `${element.value}`
            }
            case "Cell": {
                return `Cell{${element.boc}}`
            }
            case "Slice": {
                const sliceInfo = `bits: ${element.startBit}..${element.endBit} refs: ${element.startRef}..${element.endRef}`
                return `Slice{${element.hex} ${sliceInfo}}`
            }
            case "Builder": {
                return `Builder{${element.hex}}`
            }
            case "Continuation": {
                return `Cont{${element.name}}`
            }
            case "Address": {
                return `addr:${element.value}`
            }
            case "Tuple": {
                return `Tuple[${element.elements.length}]`
            }
            case "Unknown": {
                return `Unknown{${element.value}}`
            }
            case "NaN": {
                return "NaN"
            }
            default: {
                // @ts-expect-error todo
                return `UnknownType(${element.type})`
            }
        }
    }

    private buildLineToStepsMap(): void {
        this.lineToStepsMap.clear()
        if (!this.traceInfo || !this.launchArgs?.code) return

        const tolkFileMap: Map<string, Map<number, number[]>> = new Map()
        const programPath = this.launchArgs.program ?? "assembly.tasm"
        const normCodePath = this.normalizePath(programPath)
        const tasmLineMap: Map<number, number[]> = new Map()

        this.traceInfo.steps.forEach((step, index) => {
            const primaryEntry = this.getPrimarySourceMapEntry(step)
            if (primaryEntry) {
                const tolkFile = this.normalizePath(primaryEntry.file)
                if (tolkFile.includes("@stdlib")) {
                    return
                }
                if (!tolkFileMap.has(tolkFile)) {
                    tolkFileMap.set(tolkFile, new Map())
                }
                const fileLineMap = tolkFileMap.get(tolkFile)
                if (fileLineMap) {
                    const line = primaryEntry.line
                    if (!fileLineMap.has(line)) {
                        fileLineMap.set(line, [])
                    }
                    const lineSteps = fileLineMap.get(line)
                    if (lineSteps) {
                        lineSteps.push(index)
                    }
                }
            }

            if (step.loc && step.loc.line) {
                const line = step.loc.line + 1
                if (!tasmLineMap.has(line)) {
                    tasmLineMap.set(line, [])
                }
                const tasmLineSteps = tasmLineMap.get(line)
                if (tasmLineSteps) {
                    tasmLineSteps.push(index)
                }
            }
        })

        tolkFileMap.forEach((lineMap, filePath) => {
            this.lineToStepsMap.set(filePath, lineMap)
            this.log(`Built Tolk line-to-step map for ${filePath}`)
        })
        this.lineToStepsMap.set(normCodePath, tasmLineMap)
        this.log(`Built assembly line-to-step map for ${normCodePath}`)
    }

    private normalizePath(filePath: string): string {
        if (path.isAbsolute(filePath)) {
            return path.normalize(filePath)
        }
        const workspaceFolders = this.getWorkspaceFoldersSync()
        const workspaceRoot = workspaceFolders?.[0]?.uri.slice(7)
        if (workspaceRoot) {
            return path.normalize(path.resolve(workspaceRoot, filePath))
        }
        return path.normalize(filePath)
    }

    private getWorkspaceFoldersSync(): {name: string; uri: string}[] | undefined {
        const cwd = process.cwd()
        const workspaceUri = this.convertDebuggerPathToClient(cwd)
        const fileUri = workspaceUri.startsWith("file://") ? workspaceUri : `file://${workspaceUri}`
        return [{name: path.basename(cwd), uri: fileUri}]
    }

    protected override setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments,
    ): void {
        const sourcePath = args.source.path

        if (!sourcePath || !this.launchArgs?.code) {
            this.sendErrorResponse(
                response,
                3010,
                "setBreakpointsRequest: missing source path or code not launched",
            )
            return
        }

        const normClientPath = this.normalizePath(sourcePath)

        const lineMap = this.lineToStepsMap.get(normClientPath)
        if (!lineMap) {
            this.log(`Ignoring breakpoints request for file not being debugged: ${normClientPath}`)
            response.body = {breakpoints: []}
            this.sendResponse(response)
            return
        }

        this.breakPoints.delete(normClientPath)
        const requestedBps = args.breakpoints ?? []
        const actualBreakpoints: DebugProtocol.Breakpoint[] = []

        const sourceBreakpoints: DebugProtocol.SourceBreakpoint[] = requestedBps.map(bp => ({
            line: bp.line,
            column: bp.column,
            condition: bp.condition,
            hitCondition: bp.hitCondition,
            logMessage: bp.logMessage,
        }))
        this.breakPoints.set(normClientPath, sourceBreakpoints)

        for (const bp of sourceBreakpoints) {
            const line = this.convertClientLineToDebugger(bp.line)
            const isVerified = lineMap.has(line)

            const vscodeBreakpoint = new Breakpoint(isVerified, line)
            actualBreakpoints.push(vscodeBreakpoint)
        }

        response.body = {
            breakpoints: actualBreakpoints,
        }
        this.sendResponse(response)
        this.log(
            `Set ${actualBreakpoints.length} breakpoints for ${normClientPath}. Verified: ${actualBreakpoints.filter(bp => bp.verified).length}`,
        )
    }

    private findFirstTolkStep(): number {
        if (!this.traceInfo) return 0

        for (let i = 0; i < this.traceInfo.steps.length; i++) {
            const step = this.traceInfo.steps[i]
            if (step.sourceMapEntries.length > 0) {
                const primaryEntry = step.sourceMapEntries[0] // Always use first entry for finding first step
                this.log(
                    `Found first Tolk step at index ${i}: ${primaryEntry.file}:${primaryEntry.line} in ${primaryEntry.func}`,
                )
                return i
            }
        }

        this.log("No Tolk steps found, starting at step 0")
        return 0
    }

    private findNextTolkStep(stepInto: boolean): number {
        if (!this.traceInfo) return -1

        const currentStep = this.traceInfo.steps[this.currentStep]
        const currentPrimaryEntry =
            currentStep.sourceMapEntries.length > 0 ? currentStep.sourceMapEntries[0] : undefined

        if (!currentPrimaryEntry) {
            return this.currentStep + 1 < this.traceInfo.steps.length ? this.currentStep + 1 : -1
        }

        const currentFunction = currentPrimaryEntry.func
        const currentFile = currentPrimaryEntry.file
        const currentLine = currentPrimaryEntry.line

        for (let i = this.currentStep + 1; i < this.traceInfo.steps.length; i++) {
            const step = this.traceInfo.steps[i]
            const primaryEntry =
                step.sourceMapEntries.length > 0 ? step.sourceMapEntries[0] : undefined

            if (primaryEntry) {
                const stepFunction = primaryEntry.func
                const stepFile = primaryEntry.file
                const stepLine = primaryEntry.line

                if (stepInto) {
                    if (stepLine !== currentLine || stepFile !== currentFile) {
                        return i
                    }
                } else {
                    if (stepFunction === currentFunction && stepFile === currentFile) {
                        if (stepLine !== currentLine) {
                            return i
                        }
                    } else {
                        const returnStep = this.findReturnToFunction(
                            i,
                            currentFunction,
                            currentFile,
                        )
                        if (returnStep >= 0) {
                            return returnStep
                        }
                    }
                }
            }
        }

        return -1
    }

    private findReturnToFunction(
        startIndex: number,
        targetFunction: string,
        targetFile: string,
    ): number {
        if (!this.traceInfo) return -1

        for (let i = startIndex; i < this.traceInfo.steps.length; i++) {
            const step = this.traceInfo.steps[i]
            const primaryEntry =
                step.sourceMapEntries.length > 0 ? step.sourceMapEntries[0] : undefined
            if (
                primaryEntry &&
                primaryEntry.func === targetFunction &&
                primaryEntry.file === targetFile
            ) {
                return i
            }
        }

        return -1
    }

    private findPreviousTolkStep(): number {
        if (!this.traceInfo) return -1

        const currentStep = this.traceInfo.steps[this.currentStep]
        const currentPrimaryEntry =
            currentStep.sourceMapEntries.length > 0 ? currentStep.sourceMapEntries[0] : undefined
        const currentLine = currentPrimaryEntry?.line

        for (let i = this.currentStep - 1; i >= 0; i--) {
            const step = this.traceInfo.steps[i]
            const primaryEntry =
                step.sourceMapEntries.length > 0 ? step.sourceMapEntries[0] : undefined
            if (primaryEntry) {
                if (!currentLine || primaryEntry.line !== currentLine) {
                    return i
                }
            }
        }

        return -1
    }

    private continue(): void {
        if (!this.traceInfo || !this.launchArgs?.code) {
            this.log("Cannot continue: No trace info loaded or code missing.", "stderr")
            this.sendEvent(new TerminatedEvent())
            return
        }

        // // First continue through remaining entries in current step
        // const currentStepData = this.traceInfo.steps[this.currentStep]
        // for (
        //     let entryIdx = this.currentEntryIndex + 1;
        //     entryIdx < currentStepData.sourceMapEntries.length;
        //     entryIdx++
        // ) {
        //     const entry = currentStepData.sourceMapEntries[entryIdx]
        //     const tolkFile = this.normalizePath(entry.file)
        //     const tolkBreakpoints = this.breakPoints.get(tolkFile)
        //     if (tolkBreakpoints) {
        //         const line = entry.line
        //         const hitBreakpoint = tolkBreakpoints.find(
        //             bp => this.convertClientLineToDebugger(bp.line) === line,
        //         )
        //         if (hitBreakpoint) {
        //             this.log(
        //                 `Tolk breakpoint hit at ${tolkFile}:${line} (Step ${this.currentStep + 1}, Entry ${entryIdx + 1})`,
        //             )
        //             this.currentEntryIndex = entryIdx
        //             this.clearVariableHandles()
        //             this.sendEvent(new StoppedEvent("breakpoint", TolkDebugAdapterOld.THREAD_ID))
        //             return
        //         }
        //     }
        // }
        //
        // // No breakpoints in remaining entries of current step, continue to next steps
        // for (let i = this.currentStep + 1; i < this.traceInfo.steps.length; i++) {
        //     const step = this.traceInfo.steps[i]
        //
        //     // Check all entries in this step
        //     for (let entryIdx = 0; entryIdx < step.sourceMapEntries.length; entryIdx++) {
        //         const entry = step.sourceMapEntries[entryIdx]
        //         const tolkFile = this.normalizePath(entry.file)
        //         const tolkBreakpoints = this.breakPoints.get(tolkFile)
        //         if (tolkBreakpoints) {
        //             const line = entry.line
        //             const hitBreakpoint = tolkBreakpoints.find(
        //                 bp => this.convertClientLineToDebugger(bp.line) === line,
        //             )
        //             if (hitBreakpoint) {
        //                 this.log(
        //                     `Tolk breakpoint hit at ${tolkFile}:${line} (Step ${i + 1}, Entry ${entryIdx + 1})`,
        //                 )
        //                 this.currentStep = i
        //                 this.currentEntryIndex = entryIdx
        //                 this.clearVariableHandles()
        //                 this.sendEvent(new StoppedEvent("breakpoint", TolkDebugAdapterOld.THREAD_ID))
        //                 return
        //             }
        //         }
        //     }
        //
        //     if (step.loc && step.loc.line) {
        //         const programPath = this.launchArgs.program ?? "assembly.tasm"
        //         const normCodePath = this.normalizePath(programPath)
        //         const asmBreakpoints = this.breakPoints.get(normCodePath)
        //         if (asmBreakpoints) {
        //             const line = step.loc.line + 1
        //             const hitBreakpoint = asmBreakpoints.find(
        //                 bp => this.convertClientLineToDebugger(bp.line) === line,
        //             )
        //             if (hitBreakpoint) {
        //                 this.log(
        //                     `Assembly breakpoint hit at ${normCodePath}:${line} (Step ${i + 1})`,
        //                 )
        //                 this.currentStep = i
        //                 this.currentEntryIndex = 0
        //                 this.clearVariableHandles()
        //                 this.sendEvent(new StoppedEvent("breakpoint", TolkDebugAdapterOld.THREAD_ID))
        //                 return
        //             }
        //         }
        //     }
        // }

        this.log("No breakpoints hit, running to end of trace.")
        this.currentStep = this.traceInfo.steps.length - 1
        this.currentEntryIndex = 0
        this.clearVariableHandles()
        this.sendEvent(new TerminatedEvent())
    }
}
