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
import {StackElement, TraceInfo} from "ton-assembly/dist/trace"

// eslint-disable-next-line functional/type-declaration-immutability
interface NestedVariable {
    name: string
    value: string
    type?: string
    children?: NestedVariable[]
    stackValue?: StackElement
}

export class TolkDebugAdapter extends LoggingDebugSession {
    private static readonly THREAD_ID: number = 1
    private currentStep: number = 0
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
            // Parse vmLogs and create trace info with Tolk mapping if available
            this.traceInfo = createTraceInfoFromVmLogs(
                args.vmLogs,
                args.code,
                args.mapping,
                args.mappingInfo,
            )
            this.log(`Loaded trace info with ${this.traceInfo.steps.length} steps.`)

            this.buildLineToStepsMap()

            // Find first Tolk step or fallback to step 0
            this.currentStep = this.findFirstTolkStep()
            this.sendResponse(response)

            if (args.stopOnEntry === false) {
                this.continue()
            } else {
                this.sendEvent(new StoppedEvent("entry", TolkDebugAdapter.THREAD_ID))
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.log(`Error loading trace info: ${errorMessage}`)
            this.sendErrorResponse(response, 1002, `Failed to load trace info: ${errorMessage}`)
        }
    }

    protected override threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [new Thread(TolkDebugAdapter.THREAD_ID, "main thread")],
        }
        this.sendResponse(response)
    }

    private clearVariableHandles(): void {
        this.variableHandles.clear()
        this.nextVariableHandle = 1000
    }

    private buildVariableTree(
        variables: {name: string; type: string; value?: string}[],
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
        const stackFrames: StackFrame[] = []

        let source: Source
        let line: number
        let column: number

        if (currentStepData.funcLoc && this.launchArgs.mapping) {
            const funcLoc = currentStepData.funcLoc
            source = new Source(
                path.basename(funcLoc.file),
                this.convertDebuggerPathToClient(funcLoc.file),
            )
            line = funcLoc.line
            column = funcLoc.pos + 1
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
            `Stack frame: ${source.path}, Line: ${line}, Col: ${column}, Step: ${this.currentStep + 1}${currentStepData.funcLoc ? ` (Tolk: ${currentStepData.funcLoc.func})` : ""}`,
            "verbose",
        )

        const frameTitle = currentStepData.funcLoc
            ? `${currentStepData.funcLoc.func}:${currentStepData.instructionName} (Step ${this.currentStep + 1})`
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
            if (
                currentStep.funcLoc &&
                currentStep.funcLoc.vars &&
                currentStep.funcLoc.vars.length > 0
            ) {
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
                if (currentStep.funcLoc?.vars) {
                    const vars = (
                        currentStep.funcLoc.vars as unknown as {
                            name: string
                            type: string
                            value?: string
                        }[]
                    ).reverse()

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

        const nextStep = this.findNextTolkStep(false)

        if (nextStep >= 0) {
            this.currentStep = nextStep
            this.clearVariableHandles()
            this.sendResponse(response)
            this.sendEvent(new StoppedEvent("step", TolkDebugAdapter.THREAD_ID))
        } else {
            this.currentStep = this.traceInfo.steps.length - 1
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

        const nextStep = this.findNextTolkStep(true)

        if (nextStep >= 0) {
            this.currentStep = nextStep
            this.clearVariableHandles()
            this.sendResponse(response)
            this.sendEvent(new StoppedEvent("step", TolkDebugAdapter.THREAD_ID))
        } else {
            this.currentStep = this.traceInfo.steps.length - 1
            this.sendResponse(response)
            this.sendEvent(new TerminatedEvent())
        }
    }

    protected override stepBackRequest(
        response: DebugProtocol.StepBackResponse,
        args: DebugProtocol.StepBackArguments,
        request?: DebugProtocol.Request,
    ): void {
        if (this.traceInfo) {
            const prevStep = this.findPreviousTolkStep()

            if (prevStep >= 0) {
                this.currentStep = prevStep
                this.clearVariableHandles()
                this.sendResponse(response)
                this.sendEvent(new StoppedEvent("step", TolkDebugAdapter.THREAD_ID))
            } else {
                this.currentStep = 0
                this.sendResponse(response)
                this.sendEvent(new StoppedEvent("step", TolkDebugAdapter.THREAD_ID))
            }
        } else {
            this.sendErrorResponse(response, 1003, "No trace info loaded.")
        }
    }

    protected override restartRequest(
        response: DebugProtocol.RestartResponse,
        args: DebugProtocol.RestartArguments,
    ): void {
        this.currentStep = 0
        this.clearVariableHandles()
        this.sendResponse(response)
        this.sendEvent(new StoppedEvent("entry", TolkDebugAdapter.THREAD_ID))
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
            if (step.funcLoc) {
                const tolkFile = this.normalizePath(step.funcLoc.file)
                if (!tolkFileMap.has(tolkFile)) {
                    tolkFileMap.set(tolkFile, new Map())
                }
                const fileLineMap = tolkFileMap.get(tolkFile)
                if (fileLineMap) {
                    const line = step.funcLoc.line
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
            if (step.funcLoc) {
                this.log(
                    `Found first Tolk step at index ${i}: ${step.funcLoc.file}:${step.funcLoc.line} in ${step.funcLoc.func}`,
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
        const currentFuncLoc = currentStep.funcLoc

        if (!currentFuncLoc) {
            return this.currentStep + 1 < this.traceInfo.steps.length ? this.currentStep + 1 : -1
        }

        const currentFunction = currentFuncLoc.func
        const currentFile = currentFuncLoc.file
        const currentLine = currentFuncLoc.line

        for (let i = this.currentStep + 1; i < this.traceInfo.steps.length; i++) {
            const step = this.traceInfo.steps[i]

            if (step.funcLoc) {
                const stepFunction = step.funcLoc.func
                const stepFile = step.funcLoc.file
                const stepLine = step.funcLoc.line

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
            if (
                step.funcLoc &&
                step.funcLoc.func === targetFunction &&
                step.funcLoc.file === targetFile
            ) {
                return i
            }
        }

        return -1
    }

    private findPreviousTolkStep(): number {
        if (!this.traceInfo) return -1

        const currentStep = this.traceInfo.steps[this.currentStep]
        const currentLine = currentStep.funcLoc?.line

        for (let i = this.currentStep - 1; i >= 0; i--) {
            const step = this.traceInfo.steps[i]
            if (step.funcLoc) {
                if (!currentLine || step.funcLoc.line !== currentLine) {
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

        for (let i = this.currentStep + 1; i < this.traceInfo.steps.length; i++) {
            const step = this.traceInfo.steps[i]

            if (step.funcLoc) {
                const tolkFile = this.normalizePath(step.funcLoc.file)
                const tolkBreakpoints = this.breakPoints.get(tolkFile)
                if (tolkBreakpoints) {
                    const line = step.funcLoc.line
                    const hitBreakpoint = tolkBreakpoints.find(
                        bp => this.convertClientLineToDebugger(bp.line) === line,
                    )
                    if (hitBreakpoint) {
                        this.log(`Tolk breakpoint hit at ${tolkFile}:${line} (Step ${i + 1})`)
                        this.currentStep = i
                        this.clearVariableHandles()
                        this.sendEvent(new StoppedEvent("breakpoint", TolkDebugAdapter.THREAD_ID))
                        return
                    }
                }
            }

            if (step.loc && step.loc.line) {
                const programPath = this.launchArgs.program ?? "assembly.tasm"
                const normCodePath = this.normalizePath(programPath)
                const asmBreakpoints = this.breakPoints.get(normCodePath)
                if (asmBreakpoints) {
                    const line = step.loc.line + 1
                    const hitBreakpoint = asmBreakpoints.find(
                        bp => this.convertClientLineToDebugger(bp.line) === line,
                    )
                    if (hitBreakpoint) {
                        this.log(
                            `Assembly breakpoint hit at ${normCodePath}:${line} (Step ${i + 1})`,
                        )
                        this.currentStep = i
                        this.clearVariableHandles()
                        this.sendEvent(new StoppedEvent("breakpoint", TolkDebugAdapter.THREAD_ID))
                        return
                    }
                }
            }
        }

        this.log("No breakpoints hit, running to end of trace.")
        this.currentStep = this.traceInfo.steps.length - 1
        this.clearVariableHandles()
        this.sendEvent(new TerminatedEvent())
    }
}
