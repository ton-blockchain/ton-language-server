//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as path from "node:path"
import {Node as SyntaxNode} from "web-tree-sitter"
import {globalVFS, readFileVFS} from "@server/vfs/files-adapter"
import {pathToFileURL} from "node:url"

export interface AsmInstruction {
    readonly mnemonic: string
    readonly doc: {
        readonly opcode: string
        readonly stack: string
        readonly category: string
        readonly description: string
        readonly gas: string
        readonly fift: string
        readonly fift_examples: {
            readonly fift: string
            readonly description: string
        }[]
    }
    readonly since_version: number
    readonly alias_info?: AsmAlias
}

export interface AsmAlias {
    readonly mnemonic: string
    readonly alias_of: string
    readonly doc_fift?: string
    readonly doc_stack?: string
    readonly description?: string
    readonly operands: Record<string, number | string>
}

export interface AsmData {
    readonly instructions: AsmInstruction[]
    readonly aliases: AsmAlias[]
}

let data: AsmData | null = null

export async function asmData(): Promise<AsmData> {
    if (data !== null) {
        return data
    }

    const filePath = path.join(__dirname, "asm.json")
    const content = await readFileVFS(globalVFS, filePathToUri(filePath))
    if (content === undefined) return {instructions: [], aliases: []}
    data = JSON.parse(content) as AsmData
    return data
}

export const filePathToUri = (filePath: string): string => {
    const url = pathToFileURL(filePath).toString()
    return url.replace(/c:/g, "c%3A").replace(/d:/g, "d%3A")
}

export async function findInstruction(
    name: string,
    args: SyntaxNode[] = [],
): Promise<AsmInstruction | null> {
    const data = await asmData()

    const realName = adjustName(name, args)
    const instruction = data.instructions.find(i => i.mnemonic === realName)
    if (instruction) {
        return instruction
    }

    const alias = data.aliases.find(i => i.mnemonic === name)
    if (alias) {
        const instruction = data.instructions.find(i => i.mnemonic === alias.alias_of)
        if (instruction) {
            return {
                ...instruction,
                alias_info: alias,
            }
        }
    }

    return null
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

export function getStackPresentation(rawStack: string | undefined): string {
    if (!rawStack) return ""
    const trimmedStack = rawStack.trim()
    const prefix = trimmedStack.startsWith("-") ? "∅ " : ""
    const suffix = trimmedStack.endsWith("-") ? " ∅" : ""
    const stack = prefix + rawStack.replace("-", "→") + suffix
    return `(${stack})`
}
