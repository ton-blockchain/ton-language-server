//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import {
    Constant,
    Enum,
    EnumMember,
    Field,
    Func,
    GetMethod,
    GlobalVariable,
    Parameter,
    Struct,
    TypeAlias,
    TypeParameter,
} from "@server/languages/tolk/psi/Decls"
import {parentOfType} from "@server/psi/utils"
import {bitTypeName} from "@server/languages/tolk/lang/types-util"
import {generateTlBTypeDoc} from "@server/languages/tolk/documentation/tlb-type-documentation"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {TypeInferer} from "@server/languages/tolk/TypeInferer"
import {functionTypeOf, typeOf} from "@server/languages/tolk/type-inference"
import {StructTy, UnionTy, UnknownTy} from "@server/languages/tolk/types/ty"
import {EstimateContext, sizeOfPresentation} from "@server/languages/tolk/types/size-of"
import {ConstantEvaluator} from "@server/languages/tolk/evaluation/ConstantEvaluator"

/**
 * Returns the documentation for the given symbol in Markdown format, or null
 * if there is no documentation for the element.
 * @param node for which we need documentation
 * @param place where symbol is used
 */
export function generateTolkDocFor(node: NamedNode, place: SyntaxNode): string | null {
    const astNode = node.node

    function renderOwnerPresentation(symbol: Field): string | null {
        const owner = symbol.owner()
        if (!owner) return null // not possible in correct code
        return "struct " + owner.name() + "\n"
    }

    function renderEnumOwnerPresentation(symbol: EnumMember): string | null {
        const owner = symbol.owner()
        if (!owner) return null // not possible in correct code
        return "enum " + owner.name() + "\n"
    }

    switch (astNode.type) {
        case "function_declaration": {
            const func = new Func(astNode, node.file)
            const annotations = astNode.childForFieldName("annotations")
            const annotationsPresentation = annotations ? `${annotations.text}\n` : ""
            const doc = node.documentation()
            const name = node.namePresentation()

            const returnType = func.returnType()
            const returnTypePresentation = returnType
                ? "" // handled by signaturePresentation
                : ": " + functionTypeOf(func)?.returnTy.name()

            return defaultResult(
                `${annotationsPresentation}fun ${name}${func.signaturePresentation(true)}${returnTypePresentation}`,
                doc,
            )
        }
        case "method_declaration": {
            const func = new Func(astNode, node.file)
            const annotations = astNode.childForFieldName("annotations")
            const annotationsPresentation = annotations ? `${annotations.text}\n` : ""
            const doc = node.documentation()
            const name = node.namePresentation()

            const returnType = func.returnType()
            const returnTypePresentation = returnType
                ? "" // handled by signaturePresentation
                : ": " + functionTypeOf(func)?.returnTy.name()

            return defaultResult(
                `${annotationsPresentation}fun ${name}${func.signaturePresentation(true)}${returnTypePresentation}`,
                doc,
            )
        }
        case "get_method_declaration": {
            const func = new GetMethod(astNode, node.file)
            const annotations = astNode.childForFieldName("annotations")
            const annotationsPresentation = annotations ? `${annotations.text}\n` : ""
            const doc = node.documentation()
            const name = node.namePresentation()

            const methodId = func.computeMethodId()
            const methodIdPresentation = `Method ID: \`0x${methodId.toString(16)}\`\n\n`

            return defaultResult(
                `${annotationsPresentation}get fun ${name}${func.signaturePresentation(true)}`,
                methodIdPresentation + doc,
            )
        }
        case "struct_declaration": {
            const doc = node.documentation()
            const struct = new Struct(node.node, node.file)

            const fields = struct.fields().map(field => {
                const name = field.nameNode()
                if (!name) return null

                const type = field.typeNode()?.node.text ?? "unknown"

                return `    ${field.name()}: ${type}${field.defaultValuePresentation()}`
            })

            const packPrefix = struct.packPrefix()
            const packPrefixPresentation = packPrefix ? `(${packPrefix.text}) ` : ""

            const typeParametersPresentation = struct.typeParametersPresentation()

            const bodyPresentation = fields.length === 0 ? "{}" : "{\n" + fields.join("\n") + "\n}"

            const sizeDoc = structSizeOf(struct)

            return defaultResult(
                `struct ${packPrefixPresentation}${node.name()}${typeParametersPresentation} ${bodyPresentation}`,
                sizeDoc + doc,
            )
        }
        case "enum_declaration": {
            const doc = node.documentation()
            const enum_ = new Enum(node.node, node.file)

            const backedType = enum_.backedType()
            const backedTypePresentation = backedType ? `: ${backedType.text}` : ""

            const members = enum_.members().map(member => {
                const name = member.nameNode()
                if (!name) return null

                return `    ${member.name()}${member.defaultValuePresentation()}`
            })

            const bodyPresentation =
                members.length === 0 ? "{}" : "{\n" + members.join("\n") + "\n}"

            return defaultResult(
                `enum ${node.name()}${backedTypePresentation} ${bodyPresentation}`,
                doc,
            )
        }
        case "type_alias_declaration": {
            const doc = node.documentation()
            const alias = new TypeAlias(node.node, node.file)
            const underlyingTypeNode = alias.underlyingType()
            const underlyingTypeText = underlyingTypeNode?.text ?? ""
            if (underlyingTypeText === "builtin") {
                const typeName = place.text
                const bitTypeNameOrUndefined = bitTypeName(typeName)
                const tlbDoc =
                    bitTypeNameOrUndefined === undefined ? "" : (generateTlBTypeDoc(typeName) ?? "")

                return defaultResult(`type ${typeName} = builtin`, tlbDoc + doc)
            }

            const underlyingType = underlyingTypeNode ? typeOf(underlyingTypeNode, node.file) : null

            const underlyingTypePresentation =
                underlyingType instanceof UnionTy
                    ? "\n    | " + underlyingType.elements.map(it => it.name()).join("\n    | ")
                    : underlyingTypeText

            const typeParametersPresentation = alias.typeParametersPresentation()

            const sizeDoc = aliasSizeOf(alias)

            return defaultResult(
                `type ${node.name()}${typeParametersPresentation} = ${underlyingTypePresentation}`,
                sizeDoc + doc,
            )
        }
        case "constant_declaration": {
            const constant = new Constant(astNode, node.file)
            const type = TypeInferer.inferType(constant)?.name() ?? "unknown"

            const value = constant.value()
            if (!value) return null

            let evaluatedValueText = ""

            if (!ConstantEvaluator.isSimpleLiteral(constant.value()?.node)) {
                const evaluationResult = ConstantEvaluator.evaluateConstant(constant)

                if (evaluationResult.value !== null && evaluationResult.type !== "unknown") {
                    const formattedValue = ConstantEvaluator.formatValue(evaluationResult)
                    evaluatedValueText = ` // ${formattedValue}`
                }
            }

            const doc = node.documentation()
            return defaultResult(
                `const ${node.name()}: ${type} = ${value.node.text}${evaluatedValueText}`,
                doc,
            )
        }
        case "global_var_declaration": {
            const variable = new GlobalVariable(astNode, node.file)
            const type = variable.typeNode()?.node.text ?? "unknown"

            const doc = node.documentation()
            return defaultResult(`global ${node.name()}: ${type}`, doc)
        }
        case "struct_field_declaration": {
            const doc = node.documentation()
            const field = new Field(node.node, node.file)

            const ownerPresentation = renderOwnerPresentation(field)
            if (!ownerPresentation) return null // not possible in correct code

            const name = field.nameNode()
            if (!name) return null

            const type = field.typeNode()?.node.text ?? "unknown"

            return defaultResult(
                `${ownerPresentation}${node.name()}: ${type}${field.defaultValuePresentation()}`,
                doc,
            )
        }
        case "enum_member_declaration": {
            const doc = node.documentation()
            const member = new EnumMember(node.node, node.file)

            const ownerPresentation = renderEnumOwnerPresentation(member)
            if (!ownerPresentation) return null // not possible in correct code

            const name = member.nameNode()
            if (!name) return null

            return defaultResult(
                `${ownerPresentation}${node.name()}${member.defaultValuePresentation()}`,
                doc,
            )
        }
        case "var_declaration": {
            const name = astNode.childForFieldName("name")?.text ?? "unknown"

            const owner = parentOfType(astNode, "local_vars_declaration")
            if (!owner) break
            const kind = owner.childForFieldName("kind")?.text ?? "val"

            const value = owner.childForFieldName("assigned_val")

            const lhs = owner.childForFieldName("lhs")
            if (!lhs) return null

            // most simple case:
            // val some = 10
            if (lhs.type === "var_declaration" && lhs.equals(astNode)) {
                const type = typeOf(astNode, node.file)?.name() ?? "unknown"

                const valuePresentation = value ? `= ${value.text}` : ""
                return defaultResult(`${kind} ${name}: ${type} ${valuePresentation}`)
            }

            // TODO: better support for tensor/tuple variables
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
            const parameter = new Parameter(node.node, node.file)
            const type = TypeInferer.inferType(node)
            const typeName = type?.name() ?? "unknown"

            const modifiersPresentation = parameter.isMutable() ? "mutate " : ""

            return defaultResult(
                `${modifiersPresentation}${node.name()}: ${typeName}${parameter.defaultValuePresentation()}`,
            )
        }
    }

    if (node instanceof TypeParameter) {
        const typeParameter = new TypeParameter(node.node, node.file)

        const owner = typeParameter.owner()

        const ownerPresentation = owner ? owner.kindName() + " " + owner.namePresentation() : ""
        const defaultTypePresentation = typeParameter.defaultTypePresentation()

        return defaultResult(`${ownerPresentation}\n${node.name()}${defaultTypePresentation}`)
    }

    return null
}

function structSizeOf(struct: Struct): string {
    const ty = new StructTy(
        struct.fields().map(it => typeOf(it.node, it.file) ?? UnknownTy.UNKNOWN),
        struct.name(),
        struct,
    )
    const sizeOf = EstimateContext.estimate(ty)
    if (!sizeOf.valid) return ""
    const sizeOfPres = sizeOfPresentation(sizeOf)
    return `**Size:** ${sizeOfPres}.\n\n---\n\n`
}

function aliasSizeOf(alias: TypeAlias): string {
    const ty = typeOf(alias.node, alias.file)
    if (!ty) return ""
    const sizeOf = EstimateContext.estimate(ty)
    if (!sizeOf.valid) return ""
    const sizeOfPres = sizeOfPresentation(sizeOf)
    return `**Size:** ${sizeOfPres}.\n\n---\n\n`
}

function defaultResult(signature: string, documentation: string = ""): string {
    const CODE_FENCE = "```"
    const DOC_TMPL = `${CODE_FENCE}tolk\n{signature}\n${CODE_FENCE}\n{documentation}\n`
    return DOC_TMPL.replace("{signature}", signature).replace("{documentation}", documentation)
}
