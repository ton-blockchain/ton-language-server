//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {NamedNode} from "@server/languages/tlb/psi/TlbNode"

const CODE_FENCE = "```"

export function generateDeclarationDoc(decls: NamedNode[]): string {
    let result = `${CODE_FENCE}\n`

    decls.forEach((decl, index) => {
        result += `${decl.node.text}\n`

        if (index !== decls.length - 1) {
            result += `\n`
        }
    })

    result += `\n${CODE_FENCE}`
    return result
}
