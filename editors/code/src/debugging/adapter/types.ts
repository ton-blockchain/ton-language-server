import {DebugProtocol} from "@vscode/debugprotocol"

/**
 * Interface for launch configuration arguments.
 */
// eslint-disable-next-line functional/type-declaration-immutability
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    /** Assembly code as hex-encoded Cell */
    readonly code: string
    /** VM logs from transaction execution */
    readonly vmLogs: string
    /** Path to the assembly file to debug */
    readonly program?: string
    /** Enable logging of the Debug Adapter Protocol. */
    readonly trace?: boolean
    /** Automatically stop target after launch. If not specified, target does not stop. */
    readonly stopOnEntry?: boolean
    /** If VS Code should stop debugging after launch, or immediately continue. */
    readonly noDebug?: boolean
}
