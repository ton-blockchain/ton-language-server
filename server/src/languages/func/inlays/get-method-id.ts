//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"
import * as lsp from "vscode-languageserver-types"
import {FuncFile} from "@server/languages/func/psi/FuncFile"
import {Func} from "@server/languages/func/psi/Decls"

export function getMethodId(n: SyntaxNode, file: FuncFile, result: lsp.InlayHint[]): void {
    const func = new Func(n, file)
    if (!func.isGetMethod || func.hasExplicitMethodId) return

    const specifiers = n.childForFieldName("specifiers")
    const methodIdKeyword = specifiers?.children.find(it => it?.type === "method_id")
    if (!methodIdKeyword) return

    const actualId = func.computeMethodId()

    result.push({
        kind: lsp.InlayHintKind.Type,
        label: `(0x${actualId.toString(16)})`,
        position: {
            line: methodIdKeyword.endPosition.row,
            character: methodIdKeyword.endPosition.column,
        },
    })
}
