//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {FoldingRange} from "vscode-languageserver-types"

import {RecursiveVisitor} from "@server/visitor/visitor"
import {FuncFile} from "@server/languages/func/psi/FuncFile"
import {genericFolding} from "@server/foldings"

export function provideFuncFoldingRanges(file: FuncFile): FoldingRange[] {
    const result: FoldingRange[] = []

    RecursiveVisitor.visit(file.rootNode, (n): boolean => {
        if (n.type === "block_statement") {
            const openBrace = n.firstChild
            const closeBrace = n.lastChild
            if (!openBrace || !closeBrace) return true

            result.push(genericFolding(openBrace.endPosition, closeBrace.startPosition))
        }

        return true
    })

    return result
}
