//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"
import * as lsp from "vscode-languageserver-types"

import {FuncFile} from "@server/languages/func/psi/FuncFile"
import {typeOf} from "@server/languages/func/types/infer"

export function implicitConstantType(n: SyntaxNode, file: FuncFile, result: lsp.InlayHint[]): void {
    const type = n.childForFieldName("type")
    if (type) {
        // const int FOO = 100;
        //       ^^^ no need for hint
        return
    }

    const value = n.childForFieldName("value")
    if (!value) return

    const ty = typeOf(value, file)
    if (!ty) return

    const nameIdent = n.firstChild
    if (!nameIdent) return

    result.push({
        kind: lsp.InlayHintKind.Type,
        label: ty.name(),
        paddingRight: true,
        position: {
            line: nameIdent.startPosition.row,
            character: nameIdent.startPosition.column,
        },
    })
}
