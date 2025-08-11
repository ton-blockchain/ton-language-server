//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"
import {
    BitsNTy,
    BoolTy,
    BuiltinTy,
    BytesNTy,
    CoinsTy,
    FuncTy,
    InstantiationTy,
    IntNTy,
    IntTy,
    NeverTy,
    NullTy,
    StructTy,
    TensorTy,
    TupleTy,
    Ty,
    TypeAliasTy,
    TypeParameterTy,
    UnionTy,
    UnknownTy,
    VarIntNTy,
    VoidTy,
} from "@server/languages/tolk/types/ty"
import {
    CallLike,
    Expression,
    NamedNode,
    TolkNode,
    VarDeclaration,
    VariablesDeclaration,
} from "@server/languages/tolk/psi/TolkNode"
import {Reference} from "@server/languages/tolk/psi/Reference"
import {
    Constant,
    Func,
    FunctionBase,
    GlobalVariable,
    MethodBase,
    Struct,
    TypeAlias,
    TypeParameter,
} from "@server/languages/tolk/psi/Decls"
import {TOLK_CACHE} from "./cache"
import {index, IndexKey} from "@server/languages/tolk/indexes"
import {parentOfType} from "@server/psi/utils"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {infer} from "@server/languages/tolk/type-inference"

export class TypeInferer {
    public static inferType(node: TolkNode): Ty | null {
        return new TypeInferer().inferType(node)
    }

    public inferType(node: TolkNode | null): Ty | null {
        if (!node) return null
        return TOLK_CACHE.typeCache.cached(node.node.id, () => this.inferTypeImpl(node))
    }

    public inferTypeNoCache(node: TolkNode): Ty | null {
        return this.inferTypeImpl(node)
    }

    private inferTypeImpl(node: TolkNode): Ty | null {
        if (node.node.type === "assignment" || node.node.type === "set_assignment") {
            const right = node.node.childForFieldName("right")
            if (!right) return null
            return this.inferType(new TolkNode(right, node.file))
        }

        if (node.node.type === "ternary_operator") {
            const consequent = node.node.childForFieldName("consequence")
            const alternate = node.node.childForFieldName("alternative")
            if (!consequent || !alternate) return null

            const trueType = this.inferType(new Expression(consequent, node.file))
            const falseType = this.inferType(new Expression(alternate, node.file))
            if (!falseType) return trueType
            if (!trueType) return falseType

            if (trueType instanceof NullTy) {
                return UnionTy.create([falseType, NullTy.NULL])
            }

            if (falseType instanceof NullTy) {
                return UnionTy.create([trueType, NullTy.NULL])
            }

            return trueType
        }

        if (node.node.type === "binary_operator") {
            const operator = node.node.childForFieldName("operator_name")?.text
            const left = node.node.children[0]
            const right = node.node.children[2]
            if (!operator || !left || !right) return null

            if (operator === "&&" || operator === "||") {
                return BoolTy.BOOL
            }

            if (["+", "-", "*", "/", "%", "<<", ">>", "&", "|", "^"].includes(operator)) {
                return IntTy.INT
            }

            if (["<", ">", "<=", ">=", "==", "!="].includes(operator)) {
                return BoolTy.BOOL
            }

            const leftType = this.inferType(new Expression(left, node.file))
            const rightType = this.inferType(new Expression(right, node.file))
            if (!leftType || !rightType) return null

            return leftType
        }

        if (node.node.type === "unary_operator") {
            const operator = node.node.childForFieldName("operator_name")?.text
            const argument = node.node.childForFieldName("argument")
            if (!argument) return null

            if (operator === "!") {
                return BoolTy.BOOL
            }
            if (operator === "-") {
                return IntTy.INT
            }
            if (operator === "+") {
                return IntTy.INT
            }

            const argType = this.inferType(new Expression(argument, node.file))
            if (!argType) return null

            return argType
        }

        if (node.node.type === "lazy_expression") {
            const argument = node.node.childForFieldName("argument")
            if (!argument) return null
            return this.inferType(new Expression(argument, node.file))
        }

        if (node.node.type === "cast_as_operator") {
            const castedTo = node.node.childForFieldName("casted_to")
            if (!castedTo) return null
            return this.inferType(new TolkNode(castedTo, node.file))
        }

        if (node.node.type === "is_type_operator") {
            return BoolTy.BOOL
        }

        // if (node.node.type === "not_null_operator") {
        //     const inner = node.node.childForFieldName("inner")
        //     if (!inner) return null
        //     const type = this.inferType(new TolkNode(inner, node.file))
        //     if (type instanceof OptionTy) {
        //         return type.innerTy
        //     }
        //     return type
        // }

        if (node.node.type === "dot_access") {
            const name = node.node.childForFieldName("field")
            if (name === null) return null

            if (name.type === "numeric_index") {
                const qualifier = node.node.childForFieldName("obj")
                if (!qualifier) return null
                const qualifierType = this.inferType(new Expression(qualifier, node.file))
                if (!qualifierType) return null

                if (qualifierType instanceof TupleTy || qualifierType instanceof TensorTy) {
                    const idx = Number.parseInt(name.text)
                    return qualifierType.elements.at(idx) ?? null
                }
            }

            const element = new NamedNode(name, node.file)
            const resolved = Reference.resolve(element)
            if (resolved === null) return null

            return this.inferTypeFromResolved(resolved)
        }

        if (node.node.type === "function_call") {
            const call = new CallLike(node.node, node.file)
            const calleeName = call.calleeName()
            if (calleeName === null) return null

            const element = new NamedNode(calleeName, node.file)
            const resolved = Reference.resolve(element)
            if (resolved === null) return null
            if (!(resolved instanceof FunctionBase)) {
                // variable call

                const type = this.inferType(resolved)
                if (!type) return null

                if (type instanceof FuncTy) {
                    return type.returnTy
                }

                return null
            }

            const returnType = resolved.returnType()
            if (returnType === null) {
                return null
            }
            const type = this.inferType(new Expression(returnType.node, returnType.file))
            if (type instanceof TypeParameterTy) {
                const name = resolved.name()

                // T.fromCell -> T
                if (name === "fromCell" || name === "fromSlice") {
                    const callee = call.callee()
                    if (callee?.type !== "dot_access") return null

                    const obj = callee.childForFieldName("obj")
                    if (!obj) return null

                    return this.inferType(new NamedNode(obj, node.file))
                }

                return null
            }

            return type
        }

        if (node.node.type === "parenthesized_expression") {
            const inner = node.node.childForFieldName("inner")
            if (!inner) return null
            return this.inferType(new Expression(inner, node.file))
        }

        if (node.node.type === "object_literal") {
            const typeNode = node.node.childForFieldName("type")
            if (typeNode === null) {
                // need to find type from context

                const parent = node.node.parent
                if (!parent) return null

                // val data: Data = {};
                if (parent.type === "local_vars_declaration") {
                    const lhs = parent.childForFieldName("lhs")
                    if (lhs?.type === "var_declaration") {
                        const variable = new VarDeclaration(lhs, node.file)
                        const typeHintTy = variable.typeHint()?.type()
                        if (typeHintTy) {
                            return typeHintTy
                        }
                    }
                }

                // foo({})
                if (parent.type === "call_argument") {
                    const grand = parent.parent?.parent
                    if (!grand) return null

                    const call = new CallLike(grand, node.file)
                    const callee = call.callee()
                    if (callee?.equals(parent)) {
                        // {}.foo()
                        return null
                    }

                    const calleeName = call.calleeName()
                    if (!calleeName) return null

                    const args = call.arguments()
                    const index = args.findIndex(it => it.equals(parent))

                    const called = Reference.resolve(new NamedNode(calleeName, node.file))
                    if (!(called instanceof FunctionBase)) return null

                    const parameters = called.parameters(true)
                    const parameter = parameters.at(index)
                    if (!parameter) return null

                    const typeNode = parameter.node.childForFieldName("type")
                    if (!typeNode) return null
                    const inferredType = this.inferType(new Expression(typeNode, node.file))
                    return inferredType?.unwrapAlias() ?? null
                }

                if (parent.type === "instance_argument") {
                    const name = parent.childForFieldName("name")
                    if (!name) return null

                    const fieldType = this.inferType(new Expression(name, node.file))?.unwrapAlias()
                    if (!fieldType) return null

                    if (fieldType instanceof UnionTy) {
                        const structType = fieldType.elements.find(it => {
                            const unwrapped = it.baseType()
                            return unwrapped instanceof StructTy
                        })

                        if (!structType) return null
                        return structType
                    }
                    return fieldType
                }

                if (parent.type === "return_statement") {
                    const outerFunctionNode = parentOfType(
                        parent,
                        "function_declaration",
                        "method_declaration",
                        "get_method_declaration",
                    )
                    if (outerFunctionNode) {
                        const outerFunction = new Func(outerFunctionNode, node.file)
                        return outerFunction.returnType()?.type() ?? null
                    }
                }

                return null
            }

            return this.inferType(new Expression(typeNode, node.file))
        }

        if (node.node.type === "tensor_expression" || node.node.type === "typed_tuple") {
            const expressions = node.node.namedChildren.filter(it => it !== null)

            const types = expressions.map(
                it => this.inferType(new Expression(it, node.file)) ?? UnknownTy.UNKNOWN,
            )

            if (node.node.type === "tensor_expression") {
                return new TensorTy(types)
            }

            return new TupleTy(types)
        }

        if (node.node.type === "number_literal") {
            return IntTy.INT
        }

        if (node.node.type === "string_literal") {
            const node = index.elementByName(IndexKey.TypeAlias, "slice")
            if (!node) return null
            return new BuiltinTy("slice", node)
        }

        if (node.node.type === "boolean_literal") {
            return BoolTy.BOOL
        }

        if (node.node.type === "null_literal") {
            return NullTy.NULL
        }

        if (node.node.type === "underscore") {
            return null
        }

        if (node.node.type === "identifier") {
            const resolved = Reference.resolve(new NamedNode(node.node, node.file))
            if (resolved === null) return null

            const parent = resolved.node.parent
            if (parent === null) return null

            if (resolved.node.type === "var_declaration") {
                return this.inferVariableDeclarationType(resolved)
            }

            if (parent.type === "catch_clause") {
                const first = parent.childForFieldName("catch_var1")
                if (first?.equals(node.node)) {
                    return IntTy.INT
                }
                return UnknownTy.UNKNOWN
            }

            if (resolved.node.type === "struct_field_declaration") {
                const typeNode = resolved.node.childForFieldName("type")
                if (!typeNode) return null
                return this.inferType(new Expression(typeNode, resolved.file))
            }

            if (resolved.node.type === "constant_declaration") {
                return this.inferConstantDeclarationType(resolved)
            }

            if (resolved.node.type === "parameter_declaration") {
                return this.inferParameterDeclarationType(resolved)
            }

            if (resolved.node.type === "global_var_declaration") {
                return this.inferGlobalVarDeclarationType(resolved)
            }

            return this.inferTypeFromResolved(resolved)
        }

        if (node.node.type === "call_argument") {
            const expr = node.node.childForFieldName("expr")
            if (!expr) return null
            return this.inferType(new Expression(expr, node.file))
        }

        if (node instanceof NamedNode) {
            return this.inferTypeFromResolved(node)
        }

        if (node.node.type === "type_identifier") {
            const name = node.node.text
            if (name === "self") {
                return this.inferSelfType(node)
            }

            const type = TypeInferer.nameToType(name)
            if (type) {
                return type
            }

            const resolved = Reference.resolve(new NamedNode(node.node, node.file))
            if (resolved === null) return null
            return this.inferTypeFromResolved(resolved)
        }

        if (node.node.type === "nullable_type") {
            const inner = node.node.childForFieldName("inner")
            if (!inner) return null
            const innerType = this.inferType(new Expression(inner, node.file))
            if (innerType === null) return null
            return UnionTy.create([innerType, NullTy.NULL])
        }

        if (node.node.type === "tensor_type" || node.node.type === "tuple_type") {
            const expressions = node.node.namedChildren.filter(it => it !== null)

            const types = expressions.map(
                it => this.inferType(new Expression(it, node.file)) ?? UnknownTy.UNKNOWN,
            )

            if (node.node.type === "tensor_type") {
                return new TensorTy(types)
            }

            return new TupleTy(types)
        }

        if (node.node.type === "parenthesized_type") {
            const inner = node.node.childForFieldName("inner")
            if (!inner) return null
            return this.inferType(new Expression(inner, node.file))
        }

        if (node.node.type === "type_instantiatedTs") {
            const nameNode = node.node.childForFieldName("name")
            const argsNode = node.node.childForFieldName("arguments")
            if (!nameNode || !argsNode) return null

            const namedNode = new NamedNode(nameNode, node.file)
            const resolved = Reference.resolve(namedNode)

            const innerTy = this.inferType(
                new Expression(nameNode, node.file),
            )?.unwrapInstantiation()
            if (!innerTy) return null

            const args = argsNode.namedChildren.filter(it => it !== null)

            const argsTypes = args.map(
                it => this.inferType(new Expression(it, node.file)) ?? UnknownTy.UNKNOWN,
            )

            if (resolved instanceof Struct || resolved instanceof TypeAlias) {
                const mapping: Map<string, Ty> = new Map()
                const typeParameters = resolved.typeParameters()

                for (let i = 0; i < Math.min(typeParameters.length, argsTypes.length); i++) {
                    const param = typeParameters[i]
                    const type = argsTypes[i]

                    mapping.set(param.name(), type)
                }

                return new InstantiationTy(innerTy, argsTypes).substitute(mapping)
            }

            return new InstantiationTy(innerTy, argsTypes)
        }

        if (node.node.type === "fun_callable_type") {
            const paramTypeNode = node.node.childForFieldName("param_types")
            const returnTypeNode = node.node.childForFieldName("return_type")

            if (!paramTypeNode || !returnTypeNode) return null

            const paramType = this.inferType(new Expression(paramTypeNode, node.file))
            const returnType = this.inferType(new Expression(returnTypeNode, node.file))

            if (!paramType || !returnType) return null

            const paramTypes = paramType instanceof TensorTy ? paramType.elements : [paramType]

            return new FuncTy(paramTypes, returnType)
        }

        if (node.node.type === "union_type") {
            const types = this.convertUnionType(node.node, node.file)
            if (!types) return null
            return UnionTy.create(types)
        }

        return null
    }

    public static nameToType(name: string): Ty | null {
        if (name.startsWith("int") || name.startsWith("uint")) {
            const match = /^(u?int)(\d+)$/.exec(name)
            if (match) {
                const [_, prefix, bits] = match
                const bitWidth = Number.parseInt(bits)
                return new IntNTy(bitWidth, prefix === "uint")
            }
        }

        if (name.startsWith("varint") || name.startsWith("varuint")) {
            const match = /^(varu?int)(\d+)$/.exec(name)
            if (match) {
                const [_, prefix, bits] = match
                const bitWidth = Number.parseInt(bits)
                return new VarIntNTy(bitWidth, prefix === "varuint")
            }
        }

        if (name.startsWith("bits") || name.startsWith("bytes")) {
            const match = /^(bytes|bits)(\d+)$/.exec(name)
            if (match) {
                const [_, prefix, bits] = match
                const bitWidth = Number.parseInt(bits)
                if (prefix === "bytes") {
                    return new BytesNTy(bitWidth)
                }
                return new BitsNTy(bitWidth)
            }
        }

        switch (name) {
            case "void": {
                return VoidTy.VOID
            }
            case "int": {
                return IntTy.INT
            }
            case "bool": {
                return BoolTy.BOOL
            }
            case "coins": {
                return CoinsTy.COINS
            }
            case "null": {
                return NullTy.NULL
            }
            case "never": {
                return NeverTy.NEVER
            }
        }
        return null
    }

    private convertUnionType(node: SyntaxNode, file: TolkFile): Ty[] | null {
        // TODO: self recursive types
        const lhs = node.childForFieldName("lhs")
        const rhs = node.childForFieldName("rhs")

        if (!lhs || !rhs) return null

        const lhsTy = this.inferType(new Expression(lhs, file))
        if (!lhsTy) return null

        if (rhs.type === "union_type") {
            const rhsTypes = this.convertUnionType(rhs, file)
            if (!rhsTypes) return null
            return [lhsTy, ...rhsTypes]
        }

        const rhsTy = this.inferType(new Expression(rhs, file))
        if (!rhsTy) return null

        return [lhsTy, rhsTy]
    }

    private inferGlobalVarDeclarationType(resolved: NamedNode): Ty | null {
        const typeNode = resolved.node.childForFieldName("type")
        if (!typeNode) return null
        return this.inferType(new Expression(typeNode, resolved.file))
    }

    private inferVariableDeclarationType(resolved: NamedNode): Ty | null {
        const variable = new VarDeclaration(resolved.node, resolved.file)
        const typeHint = variable.typeHint()
        if (typeHint !== null) {
            return this.inferType(typeHint)
        }

        const parentDecl = parentOfType(variable.node, "local_vars_declaration")
        if (!parentDecl) return null

        const varsDeclaration = new VariablesDeclaration(parentDecl, resolved.file)

        const value = varsDeclaration.value()
        if (!value) return null

        const valueType = TypeInferer.inferType(new Expression(value, resolved.file))
        if (!valueType) return null

        if (varsDeclaration.tupleOrTensor()) {
            const unwrappedType = valueType.unwrapAlias()
            if (unwrappedType instanceof TupleTy || unwrappedType instanceof TensorTy) {
                return varsDeclaration.unpackTypeOf(variable, unwrappedType)
            }

            // cannot unpack non-tensor, non-tuple type
            return null
        }

        // simple case:
        // val a = 100
        // just return type of value
        return valueType
    }

    private inferParameterDeclarationType(parameter: NamedNode): Ty | null {
        const typeNode = parameter.node.childForFieldName("type")
        if (!typeNode) {
            if (parameter.name() === "self") {
                return this.inferSelfType(parameter)
            }
            return null
        }
        return this.inferType(new Expression(typeNode, parameter.file))
    }

    private inferSelfType(node: TolkNode): Ty | null {
        const methodOwner = parentOfType(node.node, "method_declaration")
        if (!methodOwner) {
            return null
        }
        const method = new MethodBase(methodOwner, node.file)
        const receiver = method.receiverTypeNode()
        if (receiver) {
            return this.inferType(new Expression(receiver, node.file))
        }
        return null
    }

    private inferConstantDeclarationType(resolved: NamedNode): Ty | null {
        const typeNode = resolved.node.childForFieldName("type")
        if (!typeNode) {
            const value = resolved.node.childForFieldName("value")
            if (!value) return null
            return this.inferType(new Expression(value, resolved.file))
        }
        return this.inferType(new Expression(typeNode, resolved.file))
    }

    private inferTypeFromResolved(resolved: NamedNode): Ty | null {
        if (resolved instanceof Struct) {
            const baseTy = new StructTy(
                resolved.fields().map(it => this.inferType(it.typeNode()) ?? UnknownTy.UNKNOWN),
                resolved.name(),
                resolved,
            )

            const typeParameters = resolved.typeParameters()
            if (typeParameters.length > 0) {
                return new InstantiationTy(
                    baseTy,
                    typeParameters.map(it => {
                        const defaultTypeNode = it.defaultType()
                        if (defaultTypeNode) {
                            const defaultType = this.inferTypeNoCache(
                                new Expression(defaultTypeNode, resolved.file),
                            )
                            return new TypeParameterTy(it, defaultType)
                        }
                        return new TypeParameterTy(it)
                    }),
                )
            }

            return baseTy
        }
        if (resolved instanceof TypeAlias) {
            const underlyingType = resolved.underlyingType()
            if (underlyingType === null) return null

            const underlyingTypeName = underlyingType.text
            if (underlyingTypeName === "builtin_type" || underlyingTypeName === "builtin") {
                const name = resolved.name()
                switch (name) {
                    case "void": {
                        return VoidTy.VOID
                    }
                    case "int": {
                        return IntTy.INT
                    }
                    case "bool": {
                        return BoolTy.BOOL
                    }
                    case "coins": {
                        return CoinsTy.COINS
                    }
                    case "null": {
                        return NullTy.NULL
                    }
                    case "never": {
                        return NeverTy.NEVER
                    }
                }

                return new BuiltinTy(name, resolved)
            }

            const innerTy = this.inferType(new Expression(underlyingType, resolved.file))
            if (!innerTy) return null

            const baseTy = new TypeAliasTy(resolved.name(), resolved, innerTy)

            const typeParameters = resolved.typeParameters()
            if (typeParameters.length > 0) {
                return new InstantiationTy(
                    baseTy,
                    typeParameters.map(it => {
                        const defaultTypeNode = it.defaultType()
                        if (defaultTypeNode) {
                            const defaultType = this.inferTypeNoCache(
                                new Expression(defaultTypeNode, resolved.file),
                            )
                            return new TypeParameterTy(it, defaultType)
                        }
                        return new TypeParameterTy(it)
                    }),
                )
            }

            return baseTy
        }

        if (resolved instanceof Constant) {
            return this.inferConstantDeclarationType(resolved)
        }

        if (resolved instanceof GlobalVariable) {
            return this.inferGlobalVarDeclarationType(resolved)
        }

        if (resolved instanceof TypeParameter) {
            const defaultTypeNode = resolved.defaultType()
            if (defaultTypeNode) {
                const defaultType = this.inferTypeNoCache(
                    new Expression(defaultTypeNode, resolved.file),
                )
                return new TypeParameterTy(resolved, defaultType)
            }
            return new TypeParameterTy(resolved)
        }

        if (resolved.node.type === "parameter_declaration") {
            return this.inferParameterDeclarationType(resolved)
        }

        if (resolved.node.type === "var_declaration") {
            return this.inferVariableDeclarationType(resolved)
        }

        if (resolved.node.type === "struct_field_declaration") {
            const typeNode = resolved.node.childForFieldName("type")
            if (!typeNode) return null
            return this.inferType(new Expression(typeNode, resolved.file))
        }

        if (resolved instanceof FunctionBase) {
            const result = TOLK_CACHE.funcTypeCache.cached(resolved.node.id, () => {
                return infer(resolved)
            })

            return result.ctx.getType(resolved.node)
        }

        return null
    }
}
