//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver"
import type {SemanticTokens} from "vscode-languageserver"

import {RecursiveVisitor} from "@server/visitor/visitor"
import {Tokens} from "@server/semantic/tokens"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {Reference} from "@server/languages/tolk/psi/Reference"
import {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import {isSpecialStruct, TypeParameter} from "@server/languages/tolk/psi/Decls"

function pickTarget(resolved: NamedNode[]): NamedNode | null {
    if (resolved.length === 0) {
        return null
    }

    if (resolved.length === 1) {
        return resolved[0]
    }

    if (resolved[0].node.type === "struct_field_declaration" && resolved.length > 1) {
        // For
        // fun foo(value: int) {
        //     Foo { value };
        //           ^^^^^ resolved both to struct field and parameter, highlight as parameter
        // }
        return resolved[1]
    }

    return resolved[0]
}

export function provideTolkSemanticTokens(file: TolkFile): SemanticTokens {
    const tokens = new Tokens()

    RecursiveVisitor.visit(file.rootNode, (n): boolean => {
        const type = n.type

        if (type === "struct_declaration") {
            const name = n.childForFieldName("name")
            if (!name) return true
            if (isSpecialStruct(name.text)) {
                tokens.node(name, lsp.SemanticTokenTypes.macro)
                return true
            }
            tokens.node(name, lsp.SemanticTokenTypes.struct)
            return true
        }

        if (type === "struct_field_declaration") {
            const name = n.childForFieldName("name")
            if (!name) return true
            tokens.node(name, lsp.SemanticTokenTypes.property)
            return true
        }

        if (type === "enum_declaration") {
            const name = n.childForFieldName("name")
            if (!name) return true
            tokens.node(name, lsp.SemanticTokenTypes.enum)
            return true
        }

        if (type === "enum_member_declaration") {
            const name = n.childForFieldName("name")
            if (!name) return true
            tokens.node(name, lsp.SemanticTokenTypes.enumMember)
            return true
        }

        if (type === "type_alias_declaration") {
            const name = n.childForFieldName("name")
            if (!name) return true
            tokens.node(name, lsp.SemanticTokenTypes.type)
            return true
        }

        if (type === "constant_declaration") {
            const name = n.childForFieldName("name")
            if (!name) return true
            tokens.node(name, lsp.SemanticTokenTypes.property)
            return true
        }

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
            const isMutable = n.childForFieldName("mutate") !== null

            const name = n.childForFieldName("name")
            if (!name) return true

            if (name.endIndex - name.startIndex == 4 && name.text === "self") {
                tokens.node(
                    name,
                    lsp.SemanticTokenTypes.keyword,
                    isMutable ? [lsp.SemanticTokenModifiers.modification] : [],
                )
                return true
            }
            tokens.node(
                name,
                lsp.SemanticTokenTypes.parameter,
                isMutable ? [lsp.SemanticTokenModifiers.modification] : [],
            )
            return true
        }

        if (type === "identifier" || type === "type_identifier") {
            const element = new NamedNode(n, file)
            const resolved = pickTarget(Reference.multiResolve(element))
            if (!resolved) return true
            const resolvedType = resolved.node.type

            switch (resolvedType) {
                case "parameter_declaration": {
                    const isMutable = resolved.node.childForFieldName("mutate") !== null

                    if (n.endIndex - n.startIndex == 4 && n.text === "self") {
                        tokens.node(
                            n,
                            lsp.SemanticTokenTypes.keyword,
                            isMutable ? [lsp.SemanticTokenModifiers.modification] : [],
                        )
                        return true
                    }

                    tokens.node(
                        n,
                        lsp.SemanticTokenTypes.parameter,
                        isMutable ? [lsp.SemanticTokenModifiers.modification] : [],
                    )
                    break
                }
                case "type_alias_declaration": {
                    tokens.node(n, lsp.SemanticTokenTypes.type)
                    break
                }
                case "struct_declaration": {
                    if (isSpecialStruct(n.text)) {
                        tokens.node(n, lsp.SemanticTokenTypes.macro)
                        break
                    }
                    tokens.node(n, lsp.SemanticTokenTypes.struct)
                    break
                }
                case "enum_declaration": {
                    tokens.node(n, lsp.SemanticTokenTypes.enum)
                    break
                }
                case "function_declaration": {
                    tokens.node(n, lsp.SemanticTokenTypes.function)
                    break
                }
                case "method_declaration":
                case "get_method_declaration": {
                    tokens.node(n, lsp.SemanticTokenTypes.function)
                    break
                }
                case "struct_field_declaration": {
                    tokens.node(n, lsp.SemanticTokenTypes.property)
                    break
                }
                case "enum_member_declaration": {
                    tokens.node(n, lsp.SemanticTokenTypes.enumMember)
                    break
                }
                case "constant_declaration": {
                    tokens.node(n, lsp.SemanticTokenTypes.enumMember)
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
