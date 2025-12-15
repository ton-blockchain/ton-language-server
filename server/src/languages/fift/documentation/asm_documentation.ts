//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {AsmInstruction, formatGasRanges} from "@server/languages/fift/asm/types"

export function generateAsmDoc(instruction: AsmInstruction): string | null {
    const stackInfo = instruction.instruction.signature?.stack_string
        ? `- Stack (top is on the right): \`${instruction.instruction.signature.stack_string.replace("->", "→")}\``
        : ""

    const gas = formatGasRanges(instruction.instruction.description.gas ?? [])

    const rawShort = instruction.instruction.description.short
    const rawLong = instruction.instruction.description.long

    const short = rawShort === "" ? rawLong : rawShort
    const details = short === rawLong ? "" : rawLong
    const args = instruction.instruction.description.operands.map(it => `[${it}]`).join(" ")

    const actualInstructionDescription = [
        "```",
        instruction.name + " " + args,
        "```",
        stackInfo,
        `- Gas: \`${gas}\``,
        `- Opcode: \`${instruction.instruction.layout.prefix_str}\``,
        "",
        short,
        "",
        details ? "**Details:**\n\n" + details : "",
        "",
    ]

    if (instruction.fiftInstruction) {
        const operandsStr = instruction.fiftInstruction.arguments
            .map(arg => arg.toString())
            .join(" ")
        const fiftInfoDescription = ` alias of ${instruction.fiftInstruction.actual_name} ${operandsStr}`

        return [
            "```",
            instruction.fiftInstruction.actual_name + fiftInfoDescription,
            "```",
            "",
            instruction.fiftInstruction.description ?? "",
            "",
            "---",
            "",
            "Aliased instruction info:",
            "",
            ...actualInstructionDescription,
        ].join("\n")
    }

    return actualInstructionDescription.join("\n")
}
