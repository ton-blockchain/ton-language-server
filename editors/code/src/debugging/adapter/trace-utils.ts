import {Cell} from "@ton/core"
import {compileCellWithMapping, decompileCell} from "ton-assembly/dist/runtime"
import {text} from "ton-assembly"
import {createMappingInfo, createTraceInfoPerTransaction, TraceInfo} from "ton-assembly/dist/trace"
import {SourceMap} from "ton-source-map"

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
    sourceMap?: SourceMap,
): TraceInfo {
    try {
        if (sourceMap) {
            return createTraceInfoPerTransaction(
                vmLogs,
                sourceMap.assemblyMapping,
                sourceMap.highlevelMapping,
            )[0]
        }
        return extractCodeAndTrace(Cell.fromHex(codeHex), vmLogs)
    } catch (error) {
        console.error("Error creating trace info:", error)
        return {
            steps: [],
        }
    }
}
