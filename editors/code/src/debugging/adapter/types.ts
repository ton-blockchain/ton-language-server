import {DebugProtocol} from "@vscode/debugprotocol"
import {TolkMapping} from "../../providers/TolkCompilerProvider"
import {MappingInfo} from "ton-assembly/dist/trace"

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
    /** Tolk source mapping for debugging original source */
    readonly mapping?: TolkMapping
    /** Mapping info for trace creation */
    readonly mappingInfo?: MappingInfo
    /** Enable logging of the Debug Adapter Protocol. */
    readonly trace?: boolean
    /** Automatically stop target after launch. If not specified, target does not stop. */
    readonly stopOnEntry?: boolean
    /** If VS Code should stop debugging after launch, or immediately continue. */
    readonly noDebug?: boolean
}
