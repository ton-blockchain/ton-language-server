import * as path from "node:path"

import {
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

import {StackElement, TraceInfo, createTraceInfoPerTransaction} from "ton-assembly/dist/trace"
import {HighLevelSourceMapVariable} from "ton-source-map"

import {LaunchRequestArguments} from "./types"

// eslint-disable-next-line functional/type-declaration-immutability
interface NestedVariable {
    readonly $: "nested-variable"
    readonly name: string
    readonly value: string
    readonly type?: string
    readonly stackValue?: StackElement
    children?: NestedVariable[]
}

export class TolkDebugAdapter extends LoggingDebugSession {
    private static readonly THREAD_ID: number = 1

    private launchArgs: LaunchRequestArguments | undefined

    private traceInfo: TraceInfo | undefined
    /**
     * The current step of the program being debugged.
     *
     * See `traceInfo.steps` for the list of steps.
     */
    private currentStep: number = 0

    private readonly variableHandles: Map<number, StackElement[] | NestedVariable[]> = new Map()
    private nextVariableHandle: number = 1000

    public constructor() {
        super()
        this.setDebuggerColumnsStartAt1(true)
    }

    protected override initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments,
    ): void {
        response.body = response.body ?? {}

        response.body.supportsConfigurationDoneRequest = true

        response.body.supportsDisassembleRequest = false
        response.body.supportsSteppingGranularity = true
        response.body.supportsInstructionBreakpoints = true

        response.body.supportsStepBack = false
        response.body.supportsRestartRequest = false
        response.body.supportsStepInTargetsRequest = false

        response.body.supportsConditionalBreakpoints = false
        response.body.supportsHitConditionalBreakpoints = false
        response.body.supportsLogPoints = false

        this.sendResponse(response)
        this.sendEvent(new InitializedEvent())
    }

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

        if (!args.code || !args.vmLogs) {
            this.sendErrorResponse(
                response,
                1001,
                "code and vmLogs must be provided in launch configuration.",
            )
            return
        }

        if (!args.sourceMap) {
            this.sendErrorResponse(
                response,
                1002,
                "sourceMap with at least mappingInfo field must be provided in launch configuration.",
            )
            return
        }

        this.traceInfo = createTraceInfoPerTransaction(
            args.vmLogs,
            args.sourceMap.assemblyMapping,
            args.sourceMap.highlevelMapping,
        )[0]

        if (this.traceInfo.steps.length === 0) {
            this.log(args.vmLogs)
            this.sendErrorResponse(
                response,
                1003,
                "No trace info loaded. Please check the vmLogs and sourceMap.",
            )
            return
        }

        this.sendResponse(response)

        if (args.stopOnEntry) {
            this.sendEvent(new StoppedEvent("entry", TolkDebugAdapter.THREAD_ID))
        } else {
            // todo: continue
        }
    }

    protected override stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments,
    ): void {
        if (!this.traceInfo) {
            response.body = {stackFrames: [], totalFrames: 0}
            this.sendResponse(response)
            return
        }

        const currentStep = this.traceInfo.steps[this.currentStep]
        const currentStepTargets = currentStep.sourceMapEntries
        if (currentStepTargets.length === 0) {
            response.body = {stackFrames: [], totalFrames: 0}
            this.sendResponse(response)
            return
        }
        const currentStepTarget = currentStepTargets[0]

        const stackFrames: StackFrame[] = []

        const frameTitle = `${currentStepTarget.context.containing_function} (step ${this.currentStep})`

        const filepath = currentStepTarget.loc.file
        const source = new Source(
            path.basename(filepath),
            this.convertDebuggerPathToClient(filepath),
        )
        const line = currentStepTarget.loc.line + 1
        const column = currentStepTarget.loc.column + 2

        const stackFrame = new StackFrame(0, frameTitle, source, line, column)
        stackFrame.instructionPointerReference = "ref"
        stackFrames.push(stackFrame)

        response.body = {
            stackFrames: stackFrames,
            totalFrames: 1,
        }
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

        this.log(`Next request: ${JSON.stringify(args)}`)

        this.currentStep += 1
        this.sendResponse(response)

        this.sendEvent(new StoppedEvent("step", TolkDebugAdapter.THREAD_ID))

        if (this.currentStep === this.traceInfo.steps.length) {
            this.sendEvent(new TerminatedEvent())
        }
    }

    protected override scopesRequest(
        response: DebugProtocol.ScopesResponse,
        args: DebugProtocol.ScopesArguments,
    ): void {
        if (this.traceInfo === undefined) {
            this.sendErrorResponse(response, 1003, "No trace info loaded.")
            return
        }

        const scopes: Scope[] = []

        const currentStep = this.traceInfo.steps[this.currentStep]
        const currentStepTargets = currentStep.sourceMapEntries
        if (currentStepTargets.length === 0) {
            response.body = {scopes: [new Scope("Stack", 2, false)]}
            this.sendResponse(response)
            return
        }
        const currentStepTarget = currentStepTargets[0]

        if (currentStepTarget.variables.length > 0) {
            const scope: DebugProtocol.Scope = {
                name: "Variables",
                variablesReference: 1,
                expensive: false,
                presentationHint: "locals",
            }
            scopes.push(scope)
        }

        const scope: DebugProtocol.Scope = {
            name: "Stack",
            variablesReference: 2,
            expensive: false,
            presentationHint: "registers",
        }
        scopes.push(scope)

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
                variables.push(...formatStackVariables(elementsToFormat))
            }
        } else if (ref === 1) {
            if (this.traceInfo && this.currentStep < this.traceInfo.steps.length) {
                const elementsToFormat = this.traceInfo.steps[this.currentStep].stack

                const currentStep = this.traceInfo.steps[this.currentStep]
                const currentStepTargets = currentStep.sourceMapEntries
                if (currentStepTargets.length === 0) {
                    response.body = {variables: []}
                    this.sendResponse(response)
                    return
                }

                const currentStepTarget = currentStepTargets[0]
                const vars = [...currentStepTarget.variables].reverse()

                const variableTree = this.buildVariableTree(vars, elementsToFormat)
                this.formatNestedVariables(variableTree, variables)
            }
        } else {
            const elementsToFormat = this.variableHandles.get(ref)
            if (elementsToFormat) {
                if (elementsToFormat.length > 0) {
                    const firstElement = elementsToFormat[0]
                    if (firstElement.$ === "nested-variable") {
                        this.formatNestedVariables(elementsToFormat as NestedVariable[], variables)
                    } else {
                        variables.push(...formatStackVariables(elementsToFormat as StackElement[]))
                    }
                }
            }
        }

        response.body = {variables}
        this.sendResponse(response)
    }

    private buildVariableTree(
        variables: readonly HighLevelSourceMapVariable[],
        stackElements: readonly StackElement[],
    ): NestedVariable[] {
        const root: Map<string, NestedVariable> = new Map()

        for (const [index, variable] of variables.entries()) {
            if (variable.name.startsWith("'") || variable.name.startsWith("lazy")) {
                continue
            }

            const stackValue = stackElements.at(stackElements.length - 1 - index)
            const parts = variable.name.split(".")

            if (parts.length === 1) {
                root.set(variable.name, {
                    $: "nested-variable",
                    name: variable.name,
                    value:
                        variable.constant_value ??
                        (stackValue ? formatStackElement(stackValue) : "Unknown"),
                    type: variable.type,
                    stackValue,
                })
            } else {
                const parentName = parts[0]
                const childName = parts.slice(1).join(".")

                if (!root.has(parentName)) {
                    root.set(parentName, {
                        $: "nested-variable",
                        name: parentName,
                        value: `{...}`,
                        children: [],
                    })
                }

                const parent = root.get(parentName)
                if (!parent) {
                    continue
                }
                if (!parent.children) {
                    parent.children = []
                }

                parent.children.push({
                    $: "nested-variable",
                    name: childName,
                    value:
                        variable.constant_value ??
                        (stackValue ? formatStackElement(stackValue) : "Unknown"),
                    type: variable.type,
                    stackValue,
                })
            }
        }

        return [...root.values()]
    }

    private formatNestedVariables(
        nestedVars: NestedVariable[],
        variables: DebugProtocol.Variable[],
    ): void {
        for (const nestedVar of nestedVars) {
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
        }
    }

    protected override threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [new Thread(TolkDebugAdapter.THREAD_ID, "main thread")],
        }
        this.sendResponse(response)
    }

    protected override restartRequest(
        response: DebugProtocol.RestartResponse,
        args: DebugProtocol.RestartArguments,
    ): void {
        this.currentStep = 0
        this.sendResponse(response)
        this.sendEvent(new StoppedEvent("entry", TolkDebugAdapter.THREAD_ID))
    }

    private log(
        message: string,
        category: "console" | "stdout" | "stderr" | "telemetry" | "verbose" = "console",
    ): void {
        this.sendEvent(new OutputEvent(`${message}\n`, category))
    }
}

function formatStackVariables(elementsToFormat: readonly StackElement[]): DebugProtocol.Variable[] {
    return [...elementsToFormat].reverse().map((element, index) => {
        const variableHandle = 0
        const displayValue = formatStackElement(element)

        return {
            name: `[${index}]`,
            value: displayValue,
            variablesReference: variableHandle,
            type: element.$,
        }
    })
}

function formatStackElement(element: StackElement): string {
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
