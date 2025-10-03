//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {Node as SyntaxNode} from "web-tree-sitter"
import {Position} from "vscode-languageclient"
import * as lsp from "vscode-languageserver"

import {encode, SemanticToken} from "@server/semantic/utils"

export class Tokens {
    private readonly tokens: SemanticToken[] = []

    public push(pos: Position, length: number, type: lsp.SemanticTokenTypes): void {
        this.tokens.push({
            line: pos.line,
            start: pos.character,
            len: length,
            typ: Object.keys(lsp.SemanticTokenTypes).indexOf(type),
            mods: [],
        })
    }

    public node(
        node: SyntaxNode,
        type: lsp.SemanticTokenTypes,
        modes?: string[],
        shift?: Position,
    ): void {
        this.tokens.push({
            line: node.startPosition.row + (shift?.line ?? 0),
            start: node.startPosition.column + (shift?.character ?? 0),
            len: node.endPosition.column - node.startPosition.column,
            typ: Object.keys(lsp.SemanticTokenTypes).indexOf(type),
            mods: modes ?? [],
        })
    }

    public result(): number[] {
        return encode(this.tokens)
    }
}
