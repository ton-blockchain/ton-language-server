import type {Node as SyntaxNode} from "web-tree-sitter"

import {
    FuncTy,
    HoleTy,
    PrimitiveTy,
    TensorTy,
    TupleTy,
    Ty,
    UnknownTy,
    VarTy,
} from "@server/languages/func/types/ty"
import {Func} from "@server/languages/func/psi/Decls"
import {FuncFile} from "@server/languages/func/psi/FuncFile"
import {Reference} from "@server/languages/func/psi/Reference"
import {NamedNode} from "@server/languages/func/psi/FuncNode"

export function convertTy(node: SyntaxNode | null | undefined): Ty | undefined {
    if (!node) return undefined

    if (node.type === "primitive_type") {
        return new PrimitiveTy(node.text)
    }

    if (node.type === "var_type") {
        return VarTy.VAR
    }

    if (node.type === "hole_type") {
        return HoleTy.HOLE
    }

    if (node.type === "tensor_type") {
        const types = node
            .childrenForFieldName("types")
            .filter(it => it?.isNamed)
            .filter(it => it !== null)

        return new TensorTy(types.map(it => convertTy(it) ?? UnknownTy.UNKNOWN))
    }

    if (node.type === "tuple_type") {
        const types = node
            .childrenForFieldName("types")
            .filter(it => it?.isNamed)
            .filter(it => it !== null)

        return new TupleTy(types.map(it => convertTy(it) ?? UnknownTy.UNKNOWN))
    }

    if (node.firstChild?.type === "(") {
        const type = node.child(1)
        if (!type) return undefined

        return convertTy(type)
    }

    return undefined
}

export function typeOf(node: SyntaxNode, file: FuncFile): Ty | undefined {
    if (
        node.type === "parameter_declaration" ||
        node.type === "global_var_declaration" ||
        node.type === "var_declaration"
    ) {
        const type = node.childForFieldName("type")
        if (!type) return undefined
        return convertTy(type)
    }

    if (node.type === "constant_declaration") {
        const type = node.childForFieldName("type")
        if (!type) {
            const value = node.childForFieldName("value")
            if (!value) return undefined
            return typeOf(value, file)
        }
        return convertTy(type)
    }

    if (node.type === "number_literal" || node.type === "number_string_literal") {
        return PrimitiveTy.INT
    }

    if (node.type === "string_literal" || node.type === "slice_string_literal") {
        return PrimitiveTy.SLICE
    }

    if (node.type === "constant_declaration_value") {
        const inner = node.firstChild
        if (!inner) return undefined
        return typeOf(inner, file)
    }

    if (node.type === "function_declaration") {
        const func = new Func(node, file)
        const parameterTypes = func
            .parameters()
            .map(it => typeOf(it.node, it.file) ?? UnknownTy.UNKNOWN)
        const returnTy = convertTy(func.returnType()?.node) ?? UnknownTy.UNKNOWN

        return new FuncTy(parameterTypes, returnTy)
    }

    if (node.type === "identifier" || node.type === "type_identifier") {
        const parent = node.parent
        if (parent?.type === "tensor_expression" && parent.parent?.type === "catch_clause") {
            return UnknownTy.UNKNOWN
        }

        const resolved = Reference.resolve(new NamedNode(node, file))
        if (!resolved) return undefined

        return typeOf(resolved.node, file)
    }

    return undefined
}
