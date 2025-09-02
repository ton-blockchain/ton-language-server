//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {FoldingRange} from "vscode-languageserver-types"
import {RecursiveVisitor} from "@server/visitor/visitor"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {genericFolding} from "@server/foldings"

export function provideTolkFoldingRanges(file: TolkFile): FoldingRange[] {
    const result: FoldingRange[] = []

    RecursiveVisitor.visit(file.rootNode, (n): boolean => {
        if (
            n.type === "block_statement" ||
            n.type === "object_literal_body" ||
            n.type === "match_body" ||
            n.type === "struct_body" ||
            n.type === "enum_body"
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
