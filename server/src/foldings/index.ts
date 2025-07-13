import type {Point} from "web-tree-sitter"
import type * as lsp from "vscode-languageserver"
import {FoldingRangeKind} from "vscode-languageserver-types"

export function genericFolding(start: Point, end: Point): lsp.FoldingRange {
    return {
        kind: FoldingRangeKind.Region,
        startLine: start.row,
        endLine: end.row - 1,
        startCharacter: end.column,
        endCharacter: end.column,
    }
}
