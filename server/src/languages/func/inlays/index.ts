//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver-types"

import {RecursiveVisitor} from "@server/visitor/visitor"
import {getMethodId} from "@server/languages/func/inlays/get-method-id"
import {FuncFile} from "@server/languages/func/psi/FuncFile"
import {implicitConstantType} from "@server/languages/func/inlays/implicit-constant-type"

export function collectFuncInlays(
    file: FuncFile,
    hints: {
        disable: boolean
        showMethodId: boolean
        showImplicitConstantType: boolean
    },
): lsp.InlayHint[] | null {
    if (hints.disable) return []

    const result: lsp.InlayHint[] = []

    RecursiveVisitor.visit(file.rootNode, (n): boolean => {
        const type = n.type

        if (type === "function_declaration" && hints.showMethodId) {
            getMethodId(n, file, result)
        }

        if (type === "constant_declaration" && hints.showImplicitConstantType) {
            implicitConstantType(n, file, result)
        }

        return true
    })

    if (result.length > 0) {
        return result
    }

    return null
}
