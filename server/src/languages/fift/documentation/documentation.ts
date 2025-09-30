//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type {Node as SyntaxNode} from "web-tree-sitter"

import {FiftReference} from "@server/languages/fift/psi/FiftReference"
import {FiftFile} from "@server/languages/fift/psi/FiftFile"
import {findInstruction} from "@server/languages/fift/asm/types"
import {generateAsmDoc} from "@server/languages/fift/documentation/asm_documentation"

const CODE_FENCE = "```"

export async function generateFiftDocFor(node: SyntaxNode, file: FiftFile): Promise<string | null> {
    const def = FiftReference.resolve(node, file)
    if (def) {
        return `${CODE_FENCE}fift\n${def.parent?.text}\n${CODE_FENCE}`
    }

    const instr = await findInstruction(node.text, [])
    if (!instr) return null

    const doc = generateAsmDoc(instr)
    if (doc) {
        return doc
    }

    return null
}
