//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver-types"
import {RecursiveVisitor} from "@server/visitor/visitor"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {parametersHints} from "@server/languages/tolk/inlays/parameters-hints"
import {
    catchVariableTypeHint,
    constantDeclarationTypeHint,
    functionReturnTypeHint,
    variableDeclarationTypeHint,
} from "@server/languages/tolk/inlays/type-hints"
import {getMethodId} from "@server/languages/tolk/inlays/get-method-id"
import {FunctionBase} from "@server/languages/tolk/psi/Decls"
import {Expression} from "@server/languages/tolk/psi/TolkNode"

export function collectTolkInlays(
    file: TolkFile,
    hints: {
        parameters: boolean
        types: boolean
        showMethodId: boolean
    },
): lsp.InlayHint[] | null {
    if (!hints.parameters) return []

    const result: lsp.InlayHint[] = []

    RecursiveVisitor.visit(file.rootNode, (n): boolean => {
        const type = n.type

        if (type === "function_call" && hints.parameters) {
            parametersHints(n, file, result)
            return true
        }

        if (type === "var_declaration" && hints.types) {
            variableDeclarationTypeHint(n, file, result)
            return true
        }

        if (type === "catch_clause" && hints.types) {
            const catchVar1 = n.childForFieldName("catch_var1")
            if (catchVar1) {
                const type = new Expression(catchVar1, file).type()
                catchVariableTypeHint(catchVar1, type, file, result)
            }
            return true
        }

        if (type === "constant_declaration" && hints.types) {
            constantDeclarationTypeHint(n, file, result)
            return true
        }

        if (type === "get_method_declaration" && hints.showMethodId) {
            getMethodId(n, file, result)
        }

        if (
            type === "function_declaration" ||
            type === "method_declaration" ||
            type === "get_method_declaration"
        ) {
            const func = new FunctionBase(n, file)
            if (func.returnType() !== null) return true // already has type hint
            functionReturnTypeHint(func, result)
            return true
        }

        return true
    })

    if (result.length > 0) {
        return result
    }

    return null
}
