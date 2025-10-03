//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"

import {NamedNode} from "@server/languages/func/psi/FuncNode"
import {Constant, Func, GlobalVariable, TypeParameter} from "@server/languages/func/psi/Decls"
import {parentOfType} from "@server/psi/utils"
import {typeOf} from "@server/languages/func/types/infer"
import {UnknownTy} from "@server/languages/func/types/ty"

/**
 * Returns the documentation for the given symbol in Markdown format, or null
 * if there is no documentation for the element.
 * @param node for which we need documentation
 * @param _place where symbol is used
 */
export function generateFuncDocFor(node: NamedNode, _place: SyntaxNode): string | null {
    const astNode = node.node

    switch (astNode.type) {
        case "function_declaration": {
            const func = new Func(astNode, node.file)
            const doc = node.documentation()
            const name = node.namePresentation()
            const typeParametersPresentation = func.typeParametersPresentation()

            const returnType = func.returnType()
            const returnTypePresentation = returnType?.node.text ?? "()"

            const methodId = func.isGetMethod ? func.computeMethodId() : undefined
            const methodIdPresentation = methodId
                ? `Method ID: \`0x${methodId.toString(16)}\`\n\n`
                : ""

            return defaultResult(
                `${typeParametersPresentation}${returnTypePresentation} ${name}${func.signaturePresentation(false, false)}`,
                methodIdPresentation + doc,
            )
        }
        case "constant_declaration": {
            const constant = new Constant(astNode, node.file)
            const type = typeOf(astNode, node.file) ?? UnknownTy.UNKNOWN
            const typeName = type.name()

            const value = constant.value()
            if (!value) return null

            const doc = node.documentation()
            return defaultResult(`const ${typeName} ${node.name()} = ${value.node.text}`, doc)
        }
        case "global_var_declaration": {
            const variable = new GlobalVariable(astNode, node.file)
            const type = variable.typeNode()?.node.text ?? "unknown"

            const doc = node.documentation()
            return defaultResult(`global ${type} ${node.name()}`, doc)
        }
        case "var_declaration": {
            const owner = parentOfType(astNode, "local_vars_declaration")
            if (!owner) break

            const wholeExpression = owner.parent
            if (wholeExpression?.type === "expression_statement") {
                return defaultResult(wholeExpression.text)
            }

            return defaultResult(owner.text)
        }
        case "identifier": {
            const parent = astNode.parent
            if (!parent) return null

            if (parent.type === "catch_clause") {
                return defaultResult(`catch (${node.name()})`)
            }
            break
        }
        case "parameter_declaration": {
            const type = node.node.childForFieldName("type")
            const typeName = type?.text ?? "unknown"

            return defaultResult(`${typeName} ${node.name()}`)
        }
    }

    if (node instanceof TypeParameter) {
        const typeParameter = new TypeParameter(node.node, node.file)
        const owner = typeParameter.owner()
        const ownerPresentation = owner ? owner.kindName() + " " + owner.namePresentation() : ""

        return defaultResult(`${ownerPresentation}\n${node.name()}`)
    }

    return null
}

function defaultResult(signature: string, documentation: string = ""): string {
    const CODE_FENCE = "```"
    const DOC_TMPL = `${CODE_FENCE}func\n{signature}\n${CODE_FENCE}\n{documentation}\n`
    return DOC_TMPL.replace("{signature}", signature).replace("{documentation}", documentation)
}
