//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {FoldingRange, FoldingRangeKind} from "vscode-languageserver-types"
import {RecursiveVisitor} from "@server/visitor/visitor"
import type {Point} from "web-tree-sitter"
import type * as lsp from "vscode-languageserver"
import {FuncFile} from "@server/languages/func/psi/FuncFile"

export function provideFuncFoldingRanges(file: FuncFile): FoldingRange[] {
    const result: FoldingRange[] = []

    const genericFolding = (start: Point, end: Point): lsp.FoldingRange => {
        return {
            kind: FoldingRangeKind.Region,
            startLine: start.row,
            endLine: end.row - 1,
            startCharacter: end.column,
            endCharacter: end.column,
        }
    }

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
