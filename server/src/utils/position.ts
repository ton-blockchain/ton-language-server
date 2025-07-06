//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as lsp from "vscode-languageserver/node"
import type {Node as SyntaxNode, Point} from "web-tree-sitter"

export function asNullableLspRange(node: SyntaxNode | null | undefined): lsp.Range {
    if (!node) {
        return lsp.Range.create(0, 1, 0, 1)
    }

    return lsp.Range.create(
        node.startPosition.row,
        node.startPosition.column,
        node.endPosition.row,
        node.endPosition.column,
    )
}

export function asLspRange(node: SyntaxNode): lsp.Range {
    return lsp.Range.create(
        node.startPosition.row,
        node.startPosition.column,
        node.endPosition.row,
        node.endPosition.column,
    )
}

export function asLspPosition(pos: Point): lsp.Position {
    return lsp.Position.create(pos.row, pos.column)
}

export function asParserPoint(position: lsp.Position): Point {
    return {
        column: position.character,
        row: position.line,
    }
}
