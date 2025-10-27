//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"

import * as lsp from "vscode-languageserver-types"

import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {GetMethod} from "@server/languages/tolk/psi/Decls"

export function getMethodId(n: SyntaxNode, file: TolkFile, result: lsp.InlayHint[]): void {
    const func = new GetMethod(n, file)
    if (func.hasExplicitMethodId || func.isTest()) return

    const getKeyword = n.children.find(it => it?.text === "get")
    if (!getKeyword) return

    const actualId = func.computeMethodId()

    result.push({
        kind: lsp.InlayHintKind.Type,
        label: `(0x${actualId.toString(16)})`,
        position: {
            line: getKeyword.endPosition.row,
            character: getKeyword.endPosition.column,
        },
    })
}
