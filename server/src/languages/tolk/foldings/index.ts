//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {FoldingRange, FoldingRangeKind} from "vscode-languageserver-types"
import {RecursiveVisitor} from "@server/visitor/visitor"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import type {Point} from "web-tree-sitter"
import type * as lsp from "vscode-languageserver"

export function provideTolkFoldingRanges(file: TolkFile): FoldingRange[] {
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
        if (
            n.type === "block_statement" ||
            n.type === "object_literal_body" ||
            n.type === "match_body" ||
            n.type === "struct_body"
        ) {
            const openBrace = n.firstChild
            const closeBrace = n.lastChild
            if (!openBrace || !closeBrace) return true

            result.push(genericFolding(openBrace.endPosition, closeBrace.startPosition))
        }

        return true
    })

    return result
}
