//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {SemanticTokens} from "vscode-languageserver"
import {SemanticTokenTypes} from "vscode-languageserver-protocol"
import {RecursiveVisitor} from "@server/visitor/visitor"
import {TlbReference} from "@server/languages/tlb/psi/TlbReference"
import {TlbFile} from "@server/languages/tlb/psi/TlbFile"
import {NamedNode} from "@server/languages/tlb/psi/TlbNode"
import {Tokens} from "@server/semantic/tokens"

export function provideTlbSemanticTokens(file: TlbFile): SemanticTokens {
    const tokens = new Tokens()

    RecursiveVisitor.visit(file.rootNode, (node): boolean => {
        switch (node.type) {
            case "#":
            case "##":
            case "#<":
            case "#<=":
            case "builtin_field": {
                const parent = node.parent
                if (parent?.type === "constructor_tag") break

                tokens.node(node, SemanticTokenTypes.macro)
                break
            }
            case "identifier": {
                const resolved = TlbReference.resolve(new NamedNode(node, file))
                if (resolved) {
                    const insideTypeParameter =
                        resolved.parentOfType("type_parameter") !== undefined
                    if (insideTypeParameter) {
                        tokens.node(node, SemanticTokenTypes.typeParameter)
                        break
                    }
                }
                break
            }
            case "type_identifier": {
                if (isBuiltinType(node.text)) {
                    tokens.node(node, SemanticTokenTypes.macro)
                    break
                }

                const parent = node.parent
                if (!parent) break

                if (parent.type === "combinator" || parent.type === "combinator_expr") {
                    tokens.node(node, SemanticTokenTypes.class)
                    break
                }

                const resolved = TlbReference.resolve(new NamedNode(node, file))
                if (resolved) {
                    if (resolved.node.parent?.type === "field_named") {
                        tokens.node(node, SemanticTokenTypes.variable)
                        break
                    }
                    const insideTypeParameter =
                        resolved.parentOfType("type_parameter") !== undefined
                    if (insideTypeParameter) {
                        tokens.node(node, SemanticTokenTypes.typeParameter)
                        break
                    }
                }

                tokens.node(node, SemanticTokenTypes.type)
                break
            }
            case "type_parameter": {
                const name = TlbReference.findTypeParameterNode(node)
                if (!name) break
                tokens.node(name, SemanticTokenTypes.typeParameter)
                break
            }
            case "field_named": {
                const identifier = node.firstNamedChild
                if (!identifier) break
                tokens.node(identifier, SemanticTokenTypes.property)
                break
            }
            case "constructor_": {
                const identifier = node.firstNamedChild
                if (identifier && identifier.type === "identifier") {
                    tokens.node(identifier, SemanticTokenTypes.type)
                }
                break
            }
            case "constructor_tag": {
                break
            }
            case "combinator": {
                break
            }
        }
        return true
    })

    return {
        resultId: Date.now().toString(),
        data: tokens.result(),
    }
}

function isBuiltinType(name: string): boolean {
    return (
        name === "Any" ||
        name === "Cell" ||
        name === "Int" ||
        name === "UInt" ||
        name === "Bits" ||
        name.startsWith("bits") ||
        name.startsWith("uint") ||
        name.startsWith("int")
    )
}
