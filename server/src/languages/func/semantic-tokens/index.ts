//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver"
import type {SemanticTokens} from "vscode-languageserver"

import {RecursiveVisitor} from "@server/visitor/visitor"
import {Tokens} from "@server/semantic/tokens"
import {FuncFile} from "@server/languages/func/psi/FuncFile"
import {Reference} from "@server/languages/func/psi/Reference"
import {NamedNode} from "@server/languages/func/psi/FuncNode"
import {TypeParameter} from "@server/languages/func/psi/Decls"

export function provideFuncSemanticTokens(file: FuncFile): SemanticTokens {
    const tokens = new Tokens()

    RecursiveVisitor.visit(file.rootNode, (n): boolean => {
        const type = n.type

        if (type === "global_var_declaration") {
            const name = n.childForFieldName("name")
            if (!name) return true
            tokens.node(name, lsp.SemanticTokenTypes.variable)
            return true
        }

        if (
            type === "function_declaration" ||
            type === "method_declaration" ||
            type === "get_method_declaration"
        ) {
            const name = n.childForFieldName("name")
            if (!name) return true
            tokens.node(name, lsp.SemanticTokenTypes.function)
            return true
        }

        if (type === "type_parameter") {
            const name = n.childForFieldName("name")
            if (!name) return true
            tokens.node(name, lsp.SemanticTokenTypes.typeParameter)
            return true
        }

        if (type === "parameter_declaration") {
            const name = n.childForFieldName("name")
            if (!name) return true

            tokens.node(name, lsp.SemanticTokenTypes.parameter)
            return true
        }

        if (type === "identifier" || type === "type_identifier") {
            const name = n.text
            if (name === "true" || name === "false") {
                tokens.node(n, lsp.SemanticTokenTypes.keyword)
                return true
            }

            const element = new NamedNode(n, file)
            const resolved = Reference.resolve(element)
            if (!resolved) return true
            const resolvedType = resolved.node.type

            switch (resolvedType) {
                case "parameter_declaration": {
                    tokens.node(n, lsp.SemanticTokenTypes.parameter)
                    break
                }
                case "function_declaration": {
                    tokens.node(n, lsp.SemanticTokenTypes.function)
                    break
                }
                case "constant_declaration": {
                    tokens.node(n, lsp.SemanticTokenTypes.enumMember)
                    break
                }
                case "global_var_declaration": {
                    tokens.node(n, lsp.SemanticTokenTypes.variable)
                    break
                }
                default: {
                    if (resolved instanceof TypeParameter) {
                        tokens.node(n, lsp.SemanticTokenTypes.typeParameter)
                    }
                }
            }
        }

        return true
    })

    return {
        resultId: Date.now().toString(),
        data: tokens.result(),
    }
}
