//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {Node as SyntaxNode} from "web-tree-sitter"

import type {
    FiftInstruction,
    GasConsumptionEntry,
    Instruction,
    Specification,
} from "./specification-schema.ts"

import tvmSpecData from "./tvm-specification.json"

export interface AsmInstruction {
    readonly name: string
    readonly instruction: Instruction
    readonly fiftInstruction?: FiftInstruction
}

export function instructionSpecification(): Specification {
    return tvmSpecData as unknown as Specification
}

export function findInstruction(name: string, args: SyntaxNode[] = []): AsmInstruction | undefined {
    const data = instructionSpecification()

    const realName = adjustName(name, args)
    const instruction = data.instructions.find(i => i.name === realName)
    if (instruction) {
        return {name: realName, instruction}
    }

    const fiftInstruction = data.fift_instructions.find(i => i.name === realName)
    if (fiftInstruction) {
        const instruction = data.instructions.find(i => i.name === fiftInstruction.actual_name)
        if (instruction) {
            return {name: realName, instruction, fiftInstruction}
        }
    }

    return undefined
}

function adjustName(name: string, args: SyntaxNode[]): string {
    if (name === "PUSHINT") {
        if (args.length === 0) return "PUSHINT_4"

        const arg = Number.parseInt(args[0].text)
        if (Number.isNaN(arg)) return "PUSHINT_4"

        if (arg >= 0 && arg <= 15) return "PUSHINT_4"
        if (arg >= -128 && arg <= 127) return "PUSHINT_8"
        if (arg >= -32_768 && arg <= 32_767) return "PUSHINT_16"

        return "PUSHINT_LONG"
    }

    if (name === "PUSH") {
        if (args.length === 1 && args[0].type === "asm_stack_register") return "PUSH"
        if (args.length === 2) return "PUSH2"
        if (args.length === 3) return "PUSH3"
        return name
    }

    if (name === "XCHG0") {
        return "XCHG_0I"
    }

    if (name === "XCHG") {
        return "XCHG_IJ"
    }

    return name
}

export function formatGasRanges(gasCosts: readonly GasConsumptionEntry[] | undefined): string {
    if (!gasCosts || gasCosts.length === 0) {
        return "N/A"
    }

    const formula = gasCosts.find(it => it.formula !== undefined)
    const nonFormulaCosts = gasCosts.filter(it => it.formula === undefined)

    if (nonFormulaCosts.length === 0 && formula?.formula !== undefined) {
        return formula.formula
    }
    const numericValues = nonFormulaCosts.map(it => it.value)
    const sortedCosts = [...numericValues].sort((a, b) => a - b)

    const resultParts: string[] = []
    let startIndex = 0

    for (let i = 0; i < sortedCosts.length; i++) {
        if (i === sortedCosts.length - 1 || sortedCosts[i + 1] !== sortedCosts[i] + 1) {
            if (startIndex === i) {
                resultParts.push(sortedCosts[i].toString())
            } else {
                resultParts.push(`${sortedCosts[startIndex]}-${sortedCosts[i]}`)
            }
            startIndex = i + 1
        }
    }
    const baseGas = resultParts.filter(it => it !== "36").join(" | ")
    if (formula) {
        return `${baseGas} + ${formula.formula}`
    }
    return baseGas
}
