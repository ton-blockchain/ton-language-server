import {Cell} from "@ton/core"
import {compileCellWithMapping, decompileCell} from "ton-assembly/dist/runtime"
import {text} from "ton-assembly"
import {
    createMappingInfo,
    createTraceInfoPerTransaction,
    TraceInfo,
    MappingInfo,
} from "ton-assembly/dist/trace"
import {TolkMapping} from "../../providers/TolkCompilerProvider"

function extractCodeAndTrace(codeCell: Cell | undefined, vmLogs: string): TraceInfo {
    if (!codeCell) {
        return {steps: []}
    }

    try {
        const instructions = decompileCell(codeCell)
        const code = text.print(instructions)

        const instructionsWithPositions = text.parse("out.tasm", code)
        if (instructionsWithPositions.$ === "ParseFailure") {
            console.error("Failed to parse decompiled code:", instructionsWithPositions.error)
            return {steps: []}
        }

        const [, mapping] = compileCellWithMapping(instructionsWithPositions.instructions)
        const mappingInfo = createMappingInfo(mapping)
        return createTraceInfoPerTransaction(vmLogs, mappingInfo, undefined)[0]
    } catch (error) {
        console.error("Error in extractCodeAndTrace:", error)
        return {steps: []}
    }
}

export function createTraceInfoFromVmLogs(
    vmLogs: string,
    codeHex: string,
    tolkMapping?: TolkMapping,
    tolkMappingInfo?: MappingInfo,
): TraceInfo {
    try {
        if (tolkMapping && tolkMappingInfo) {
            return createTraceInfoPerTransaction(vmLogs, tolkMappingInfo, tolkMapping)[0]
        }
        return extractCodeAndTrace(Cell.fromHex(codeHex), vmLogs)
    } catch (error) {
        console.error("Error creating trace info:", error)
        return {
            steps: [],
        }
    }
}
