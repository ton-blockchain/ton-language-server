import {
    Breakpoint,
    InitializedEvent,
    LoggingDebugSession,
    OutputEvent,
    StoppedEvent,
    Thread,
    StackFrame,
    Scope,
    TerminatedEvent,
    Source,
} from "@vscode/debugadapter"
import {DebugProtocol} from "@vscode/debugprotocol"
import * as path from "node:path"
import {LaunchRequestArguments} from "./types"
import {createTraceInfoFromVmLogs} from "./trace-utils"
import {StackElement, TraceInfo} from "ton-assembly/dist/trace"

export class AssemblyDebugAdapter extends LoggingDebugSession {
    private static readonly THREAD_ID: number = 1
    private currentStep: number = 0
    private traceInfo: TraceInfo | undefined
    private launchArgs: LaunchRequestArguments | undefined

    private readonly variableHandles: Map<number, StackElement[]> = new Map()
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
            // Parse vmLogs and create trace info
            this.traceInfo = createTraceInfoFromVmLogs(args.vmLogs, args.code)
            this.log(`Loaded trace info with ${this.traceInfo.steps.length} steps.`)

            this.buildLineToStepsMap()

            this.currentStep = 0
            this.sendResponse(response)

            if (args.stopOnEntry === false) {
                this.continue()
            } else {
                this.sendEvent(new StoppedEvent("entry", AssemblyDebugAdapter.THREAD_ID))
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.log(`Error loading trace info: ${errorMessage}`)
            this.sendErrorResponse(response, 1002, `Failed to load trace info: ${errorMessage}`)
        }
    }

    protected override threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [new Thread(AssemblyDebugAdapter.THREAD_ID, "main thread")],
        }
        this.sendResponse(response)
    }

    private clearVariableHandles(): void {
        this.variableHandles.clear()
        this.nextVariableHandle = 1000
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

        // Get the program path from launch arguments or use default
        const programPath = this.launchArgs.program ?? "assembly.tasm"
        const source = new Source(
            path.basename(programPath),
            this.convertDebuggerPathToClient(programPath),
        )

        const line = (currentStepData.loc?.line ?? 0) + 1
        const column = 1

        this.log(
            `Stack frame: ${source.path}, Line: ${line}, Col: ${column}, Step: ${this.currentStep + 1}`,
            "verbose",
        )

        stackFrames.push(
            new StackFrame(
                0,
                `${currentStepData.instructionName} (Step ${this.currentStep + 1})`,
                source,
                line,
                column,
            ),
        )

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
        response.body = {
            scopes: [new Scope("Stack", 1, false)],
        }
        this.sendResponse(response)
    }

    protected override variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments,
        request?: DebugProtocol.Request,
    ): void {
        const variables: DebugProtocol.Variable[] = []
        const ref = args.variablesReference

        let elementsToFormat: readonly StackElement[] | undefined

        if (ref === 1) {
            if (this.traceInfo && this.currentStep < this.traceInfo.steps.length) {
                elementsToFormat = this.traceInfo.steps[this.currentStep].stack
            }
        } else {
            elementsToFormat = this.variableHandles.get(ref)
        }

        if (elementsToFormat) {
            elementsToFormat.forEach((element, index) => {
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
                    name: `[${elementsToFormat.length - 1 - index}]`,
                    value: displayValue,
                    variablesReference: variableHandle,
                    type: element.$,
                })
            })
        }

        response.body = {
            variables: variables,
        }
        this.sendResponse(response)
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
        if (this.traceInfo) {
            this.currentStep++
            this.clearVariableHandles()
            if (this.currentStep < this.traceInfo.steps.length) {
                this.sendResponse(response)
                this.sendEvent(new StoppedEvent("step", AssemblyDebugAdapter.THREAD_ID))
            } else {
                this.currentStep = this.traceInfo.steps.length - 1
                this.sendResponse(response)
                this.sendEvent(new TerminatedEvent())
            }
        } else {
            this.sendErrorResponse(response, 1003, "No trace info loaded.")
        }
    }

    protected override stepBackRequest(
        response: DebugProtocol.StepBackResponse,
        args: DebugProtocol.StepBackArguments,
        request?: DebugProtocol.Request,
    ): void {
        if (this.traceInfo) {
            this.currentStep--
            this.clearVariableHandles()
            if (this.currentStep >= 0) {
                this.sendResponse(response)
                this.sendEvent(new StoppedEvent("step", AssemblyDebugAdapter.THREAD_ID))
            } else {
                this.currentStep = 0
                this.sendResponse(response)
                this.sendEvent(new TerminatedEvent())
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
        this.sendEvent(new StoppedEvent("entry", AssemblyDebugAdapter.THREAD_ID))
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

        const programPath = this.launchArgs.program ?? "assembly.tasm"
        const normCodePath = this.normalizePath(programPath)
        const tasmLineMap: Map<number, number[]> = new Map()

        this.traceInfo.steps.forEach((step, index) => {
            if (step.loc && step.loc.line) {
                const line = step.loc.line + 1
                if (!tasmLineMap.has(line)) {
                    tasmLineMap.set(line, [])
                }
                tasmLineMap.get(line)?.push(index)
            }
        })
        this.lineToStepsMap.set(normCodePath, tasmLineMap)
        this.log(`Built line-to-step map for ${normCodePath}`)
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
        const clientLines = args.lines ?? []
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
        const programPath = this.launchArgs.program ?? "assembly.tasm"
        const normCodePath = this.normalizePath(programPath)

        if (normClientPath !== normCodePath) {
            this.log(`Ignoring breakpoints request for file not being debugged: ${normClientPath}`)
            response.body = {breakpoints: []}
            this.sendResponse(response)
            return
        }

        this.breakPoints.delete(normCodePath)
        const requestedBps = args.breakpoints ?? []
        const actualBreakpoints: DebugProtocol.Breakpoint[] = []

        const sourceBreakpoints: DebugProtocol.SourceBreakpoint[] = requestedBps.map(bp => ({
            line: bp.line,
            column: bp.column,
            condition: bp.condition,
            hitCondition: bp.hitCondition,
            logMessage: bp.logMessage,
        }))
        this.breakPoints.set(normCodePath, sourceBreakpoints)

        const tasmLineMap = this.lineToStepsMap.get(normCodePath)
        for (const bp of sourceBreakpoints) {
            const line = this.convertClientLineToDebugger(bp.line)
            const isVerified = !!(tasmLineMap && tasmLineMap.has(line))

            const vscodeBreakpoint = new Breakpoint(isVerified, line)
            actualBreakpoints.push(vscodeBreakpoint)
        }

        response.body = {
            breakpoints: actualBreakpoints,
        }
        this.sendResponse(response)
        this.log(
            `Set ${actualBreakpoints.length} breakpoints for ${normCodePath}. Verified: ${actualBreakpoints.filter(bp => bp.verified).length}`,
        )
    }

    private continue(): void {
        if (!this.traceInfo || !this.launchArgs?.code) {
            this.log("Cannot continue: No trace info loaded or code missing.", "stderr")
            this.sendEvent(new TerminatedEvent())
            return
        }

        const programPath = this.launchArgs.program ?? "assembly.tasm"
        const normCodePath = this.normalizePath(programPath)
        const breakpointsInFile = this.breakPoints.get(normCodePath)

        for (let i = this.currentStep + 1; i < this.traceInfo.steps.length; i++) {
            const step = this.traceInfo.steps[i]
            // Check breakpoints based on step.loc.line
            if (step.loc && step.loc.line && breakpointsInFile) {
                const line = step.loc.line + 1
                const hitBreakpoint = breakpointsInFile.find(
                    bp => this.convertClientLineToDebugger(bp.line) === line,
                )
                if (hitBreakpoint) {
                    this.log(`Breakpoint hit at ${normCodePath}:${line} (Step ${i + 1})`)
                    this.currentStep = i
                    this.clearVariableHandles()
                    this.sendEvent(new StoppedEvent("breakpoint", AssemblyDebugAdapter.THREAD_ID))
                    return
                }
            }
        }

        this.log("No breakpoints hit, running to end of trace.")
        this.currentStep = this.traceInfo.steps.length - 1
        this.clearVariableHandles()
        this.sendEvent(new TerminatedEvent())
    }
}
