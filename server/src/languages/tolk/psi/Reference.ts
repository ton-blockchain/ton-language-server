//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"

import {ResolveState} from "@server/psi/ResolveState"
import {TOLK_CACHE} from "@server/languages/tolk/cache"
import {
    Constant,
    Enum,
    Func,
    GetMethod,
    GlobalVariable,
    InstanceMethod,
    MethodBase,
    Parameter,
    StaticMethod,
    Struct,
    TypeAlias,
    TypeParameter,
} from "@server/languages/tolk/psi/Decls"
import {index, IndexFinder, IndexKey} from "@server/languages/tolk/indexes"
import {ImportResolver} from "@server/languages/tolk/psi/ImportResolver"
import {filePathToUri} from "@server/files"
import {bitTypeName} from "@server/languages/tolk/lang/types-util"
import {
    TypeAliasTy,
    StructTy,
    Ty,
    FieldsOwnerTy,
    InstantiationTy,
    BuiltinTy,
    UnionTy,
    NullTy,
    EnumTy,
} from "@server/languages/tolk/types/ty"
import {parentOfType} from "@server/psi/utils"
import {inferenceOf, typeOf} from "@server/languages/tolk/type-inference"

import type {TolkFile} from "./TolkFile"
import {Expression, NamedNode, TolkNode, VarDeclaration} from "./TolkNode"

export interface ScopeProcessor {
    execute(node: TolkNode, state: ResolveState): boolean
}

export class Reference {
    private readonly element: NamedNode
    private readonly forTypes: boolean
    private readonly skipBlock: boolean
    private readonly onlyBlock: boolean

    public static multiResolve(node: NamedNode): NamedNode[] {
        if (node.node.parent?.type === "instance_argument") {
            const name = node.node.parent.childForFieldName("name")
            const value = node.node.parent.childForFieldName("value")
            if (value === null && name?.equals(node.node)) {
                // Foo { name }
                //       ^^^^ resolved both to field and parameter/variable
                return new Reference(node, false, false).multiResolveImpl()
            }
        }

        const resolved = Reference.resolve(node)
        if (!resolved) return []
        return [resolved]
    }

    public static resolve(
        node: NamedNode | null,
        skipBlock: boolean = false,
        onlyBlock: boolean = false,
    ): NamedNode | null {
        if (node === null) return null
        return new Reference(node, skipBlock, onlyBlock).resolve()
    }

    public constructor(element: NamedNode, skipBlock: boolean, onlyBlock: boolean) {
        this.element = element

        // For match arms like:
        // FOO => {}
        // resolve FOO both as type and value
        this.forTypes =
            element.node.type === "type_identifier" && element.node.parent?.type !== "match_arm"
        this.skipBlock = skipBlock
        this.onlyBlock = onlyBlock
    }

    private multiResolveImpl(): NamedNode[] {
        if (this.element.node.startIndex === this.element.node.endIndex) return []

        const result: NamedNode[] = []
        const state = new ResolveState()
        this.processResolveVariants(
            Reference.createMultiResolveProcessor(result, this.element),
            state,
        )
        return result
    }

    public resolve(): NamedNode | null {
        return TOLK_CACHE.resolveCache.cached(this.element.node.id, () => this.resolveImpl())
    }

    private resolveImpl(): NamedNode | null {
        if (this.element.node.startIndex === this.element.node.endIndex) return null

        const result: NamedNode[] = []
        const state = new ResolveState()
        this.processResolveVariants(Reference.createResolveProcessor(result, this.element), state)
        if (result.length === 0) return null
        return result[0]
    }

    private static createResolveProcessor(result: TolkNode[], element: TolkNode): ScopeProcessor {
        return new (class implements ScopeProcessor {
            public execute(node: TolkNode, state: ResolveState): boolean {
                if (node.node.equals(element.node)) {
                    result.push(node)
                    return false
                }

                if (!(node instanceof NamedNode) || !(element instanceof NamedNode)) {
                    return true
                }

                const searchName = state.get("search-name") ?? element.name()

                if (node.name() === searchName) {
                    result.push(node)
                    return false
                }

                return true
            }
        })()
    }

    private static createMultiResolveProcessor(
        result: TolkNode[],
        element: TolkNode,
    ): ScopeProcessor {
        return new (class implements ScopeProcessor {
            public execute(node: TolkNode, state: ResolveState): boolean {
                if (node.node.equals(element.node)) {
                    result.push(node)
                    return true
                }

                if (!(node instanceof NamedNode) || !(element instanceof NamedNode)) {
                    return true
                }

                const searchName = state.get("search-name") ?? element.name()

                if (node.name() === searchName) {
                    result.push(node)
                    return true
                }

                return true
            }
        })()
    }

    public processResolveVariants(proc: ScopeProcessor, state: ResolveState): boolean {
        if (this.elementIsDeclarationName()) {
            // foo: Int
            // ^^^ our element
            //
            // so process whole `foo: Int` node
            const parent = this.element.node.parent
            if (!parent) return true
            return proc.execute(Reference.declarationAstToNode(parent, this.element.file), state)
        }

        const qualifier = Reference.getQualifier(this.element)
        return qualifier
            ? // foo.bar
              // ^^^ qualifier
              this.processQualifiedExpression(qualifier, proc, state)
            : //  bar()
              // ^ no qualifier
              this.processUnqualifiedResolve(proc, state)
    }

    private elementIsDeclarationName(): boolean {
        // foo: int
        // ^^^ maybe this
        const identifier = this.element.node

        // foo: int
        // ^^^^^^^^ this
        const parent = identifier.parent

        // foo: in
        // ^^^ this
        const name = parent?.childForFieldName("name")
        if (!parent || !name) return false

        if (parent.type === "var_declaration") {
            if (parent.childForFieldName("redef") !== null) {
                // don't treat redef as standalone variable
                return false
            }
            return name.equals(identifier)
        }

        // prettier-ignore
        return (
            parent.type === "global_var_declaration" ||
            parent.type === "type_alias_declaration" ||
            parent.type === "struct_field_declaration" ||
            parent.type === "enum_member_declaration" ||
            parent.type === "parameter_declaration" ||
            parent.type === "var_declaration" ||
            parent.type === "struct_declaration" ||
            parent.type === "enum_declaration" ||
            parent.type === "function_declaration" ||
            parent.type === "method_declaration" ||
            parent.type === "get_method_declaration" ||
            parent.type === "constant_declaration"
        ) && name.equals(identifier)
    }

    private static declarationAstToNode(node: SyntaxNode, file: TolkFile): NamedNode {
        if (node.type === "constant_declaration") {
            return new Constant(node, file)
        }
        if (node.type === "global_var_declaration") {
            return new GlobalVariable(node, file)
        }
        if (node.type === "struct_declaration") {
            return new Struct(node, file)
        }
        if (node.type === "enum_declaration") {
            return new Enum(node, file)
        }
        if (node.type === "function_declaration") {
            return new Func(node, file)
        }
        if (node.type === "method_declaration") {
            const fun = new Func(node, file)
            if (fun.isInstanceMethod()) {
                return new InstanceMethod(node, file)
            }
            if (fun.isStaticMethod()) {
                return new StaticMethod(node, file)
            }
            return fun
        }
        if (node.type === "get_method_declaration") {
            return new GetMethod(node, file)
        }
        if (node.type === "var_declaration") {
            return new VarDeclaration(node, file)
        }

        return new NamedNode(node, file)
    }

    private static getQualifier(node: TolkNode): Expression | null {
        const parent = node.node.parent
        if (!parent) {
            return null
        }

        if (parent.type === "dot_access") {
            const field = parent.childForFieldName("field")
            if (field === null) return null
            if (!field.equals(node.node)) return null
            const qualifier = parent.childForFieldName("obj")
            if (!qualifier) return null
            return new Expression(qualifier, node.file)
        }

        return null
    }

    private processQualifiedExpression(
        qualifier: Expression,
        proc: ScopeProcessor,
        state: ResolveState,
    ): boolean {
        const inference = inferenceOf(qualifier.node, qualifier.file)

        if (!state.get("completion")) {
            // For resolving we have a stable state, during inference we already resolved all
            // `foo.bar` expressions, so we just reuse that result.
            const cachedResolved = inference?.resolve(this.element.node)
            if (cachedResolved) {
                if (!proc.execute(cachedResolved, state)) return false
            }

            // console.info(`cache miss for ${this.element.name()}`)
            return true
        }

        // For completion, we still need to manually walk all possible variants.
        // But nevertheless, we can use inference results for faster resolving
        const resolved = inference?.resolve(qualifier.node)
        if (resolved) {
            // static methods like Foo.bar();
            if (resolved instanceof Struct || resolved instanceof TypeAlias) {
                return this.processStaticMethods(resolved.name(), proc, state)
            }
        }

        const qualifierType = inference?.typeOf(qualifier.node)?.unwrapOption()
        if (!qualifierType) return true

        if (qualifier.node.type === "generic_instantiation") {
            // Foo<int>.bar()
            const baseType = qualifierType.unwrapInstantiation()
            return this.processStaticMethods(baseType.name(), proc, state)
        }

        const unwrappedQualifierType = qualifierType.unwrapAlias()
        if (resolved && unwrappedQualifierType instanceof EnumTy) {
            // `Color.Red` support even if Color is an alias to enum
            if (!Reference.processNamedEls(proc, state, unwrappedQualifierType.members())) {
                return false
            }
            if (!this.processStaticMethods(resolved.name(), proc, state)) {
                return false
            }
        }

        if (!this.processType(qualifier, qualifierType, proc, state)) return false

        // last resort, trying to find methods of T?
        // return this.processType(qualifier, new OptionTy(qualifierType), proc, state)
        return true
    }

    private processStaticMethods(
        typeName: string,
        proc: ScopeProcessor,
        state: ResolveState,
    ): boolean {
        return index.processElementsByKey(
            IndexKey.Methods,
            new (class implements ScopeProcessor {
                public execute(node: InstanceMethod | StaticMethod, state: ResolveState): boolean {
                    if (node instanceof InstanceMethod) return true
                    const receiverTypeString = node.receiverTypeString()
                    if (receiverTypeString === typeName || receiverTypeString === "T") {
                        return proc.execute(node, state)
                    }

                    const receiverType = node.receiverTypeNode()
                    if (receiverType?.type === "type_instantiatedTs") {
                        const innerName = receiverType.childForFieldName("name")?.text
                        if (innerName === typeName) {
                            return proc.execute(node, state)
                        }
                    }

                    return true
                }
            })(),
            state,
        )
    }

    private processType(
        qualifier: Expression,
        qualifierType: Ty | StructTy | TypeAliasTy,
        proc: ScopeProcessor,
        state: ResolveState,
    ): boolean {
        if (qualifierType instanceof StructTy) {
            if (!Reference.processNamedEls(proc, state, qualifierType.fields())) return false
        }

        if (qualifierType instanceof TypeAliasTy) {
            // first process type alias methods
            if (!this.processTypeMethods(qualifierType, proc, state)) return false

            // and then underlying type
            return this.processType(qualifier, qualifierType.innerTy, proc, state)
        }

        if (qualifierType instanceof InstantiationTy) {
            // first process instantiation methods
            if (!this.processTypeMethods(qualifierType, proc, state)) return false

            const innerTy = qualifierType.unwrapInstantiation()

            if (innerTy.name() === "Cell") {
                const callTy = new BuiltinTy("cell", null)
                const nullableCellTy = new UnionTy([callTy, NullTy.NULL])
                if (!this.processType(qualifier, callTy, proc, state)) return false
                if (!this.processType(qualifier, nullableCellTy, proc, state)) return false
            }

            // and then underlying type
            return this.processType(qualifier, innerTy, proc, state)
        }

        return this.processTypeMethods(qualifierType, proc, state)
    }

    private processTypeMethods(ty: Ty, proc: ScopeProcessor, state: ResolveState): boolean {
        const file = this.element.file
        const tyName = ty.name()
        return index.processElementsByKey(
            IndexKey.Methods,
            new (class implements ScopeProcessor {
                public execute(fun: InstanceMethod | StaticMethod, state: ResolveState): boolean {
                    if (fun instanceof StaticMethod) return true

                    const receiverType = fun.receiverTypeNode()
                    if (this.typeMatches(file, ty, tyName, receiverType)) {
                        return proc.execute(fun, state)
                    }

                    return true
                }

                private typeMatches(
                    file: TolkFile,
                    expected: Ty,
                    expectedTyName: string,
                    receiver: SyntaxNode | null,
                ): boolean {
                    if (receiver?.type === "type_identifier") {
                        const receiverTypeName = receiver.text
                        if (receiverTypeName === "T") {
                            // for `fun T.toCell() {}` we accept any T
                            return true
                        }
                        // simple case
                        return expectedTyName == receiverTypeName
                    }

                    if (receiver?.type === "type_instantiatedTs") {
                        const receiverType = typeOf(receiver, file)
                        if (
                            receiverType instanceof InstantiationTy &&
                            expected instanceof InstantiationTy
                        ) {
                            return receiverType.innerTy.name() === expected.innerTy.name()
                        }
                    }

                    if (receiver?.type === "nullable_type") {
                        const inner = receiver.childForFieldName("inner")
                        if (expected instanceof UnionTy) {
                            const asNullable = expected.asNullable()
                            if (asNullable !== undefined) {
                                return this.typeMatches(
                                    file,
                                    asNullable[0],
                                    asNullable[0].name(),
                                    inner,
                                )
                            }
                        }
                    }

                    return false
                }
            })(),
            state,
        )
    }

    public static processNamedEls(
        proc: ScopeProcessor,
        state: ResolveState,
        elements: NamedNode[],
    ): boolean {
        for (const element of elements) {
            if (!proc.execute(element, state)) return false
        }
        return true
    }

    private processUnqualifiedResolve(proc: ScopeProcessor, state: ResolveState): boolean {
        const name = this.element.node.text
        if (!name || name === "" || name === "_") return true

        if (this.onlyBlock) {
            return this.processBlock(proc, state)
        }

        const bitTypeNameOrUndefined = bitTypeName(name)
        if (bitTypeNameOrUndefined !== undefined) {
            state = state.withValue("search-name", bitTypeNameOrUndefined)
        }

        const parent = this.element.node.parent
        // foo.bar
        // ^^^ this
        const isQualifier = parent?.type === "dot_access"
        state = state.withValue("dot-qualifier", String(isQualifier))

        if (parent?.type === "instance_argument") {
            // `Foo { name: "" }`
            //        ^^^^^^^^ this
            if (!this.resolveInstanceInitField(parent, proc, state)) return false
        }

        if (!this.skipBlock) {
            if (!this.processBlock(proc, state)) return false
        }

        if (!this.processAllEntities(proc, state)) return false

        // maybe it's T in `fun Foo<T>.bar() {}
        const parentMethodReceiver = parentOfType(this.element.node, "method_receiver")
        if (parentMethodReceiver) {
            const parameter = new TypeParameter(this.element.node, this.element.file)
            if (!proc.execute(parameter, state)) return false
        }

        return true
    }

    private resolveInstanceInitField(
        parent: SyntaxNode,
        proc: ScopeProcessor,
        state: ResolveState,
    ): boolean {
        // resolving `Foo { name: "" }`
        //                  ^^^^ this

        const name = parent.childForFieldName("name")
        if (!name) return true

        if (!name.equals(this.element.node)) {
            // `Foo { name: "" }`
            //        ^^^^ this should be our identifier to resolve
            return true
        }

        // `Foo { name: "" }`
        //  ^^^^^^^^^^^^^^^^ this
        const instanceExpr = parent.parent?.parent
        if (!instanceExpr) return true

        const expr = new Expression(instanceExpr, this.element.file)
        const type = typeOf(expr.node, expr.file)?.baseType()
        if (!type) return true

        if (!(type instanceof FieldsOwnerTy)) return true

        for (const field of type.fields()) {
            if (!proc.execute(field, state)) return false
        }
        return true
    }

    public processBlock(proc: ScopeProcessor, state: ResolveState): boolean {
        const file = this.element.file
        let descendant: SyntaxNode | null = this.element.node

        let startStatement: SyntaxNode | null = null

        while (descendant) {
            // walk all variables inside block
            if (descendant.type === "block_statement" && !this.forTypes) {
                if (!this.processBlockStatement(descendant, startStatement, proc, file, state)) {
                    return false
                }
            }

            // catch (error)
            // catch (error, data)
            if (descendant.type === "catch_clause" && !this.forTypes) {
                const catchVar1 = descendant.childForFieldName("catch_var1")
                if (catchVar1) {
                    if (!proc.execute(new NamedNode(catchVar1, file), state)) return false
                }
                const catchVar2 = descendant.childForFieldName("catch_var2")
                if (catchVar2) {
                    if (!proc.execute(new NamedNode(catchVar2, file), state)) return false
                }
            }

            // match (val foo = 100) {}
            if (descendant.type === "match_expression" && !this.forTypes) {
                const expr = descendant.childForFieldName("expr")
                if (expr?.type === "local_vars_declaration") {
                    const lhs = expr.childForFieldName("lhs")
                    if (lhs) {
                        if (!this.processVariableDeclaration(lhs, proc, file, state)) return false
                    }
                }
            }

            // process parameters of function
            const isFunction =
                descendant.type === "function_declaration" ||
                descendant.type === "method_declaration" ||
                descendant.type === "get_method_declaration"

            if (isFunction && (!this.forTypes || this.element.node.text === "self")) {
                const rawParameters = descendant.childForFieldName("parameters")
                const children = rawParameters?.children ?? []
                if (children.length < 2) break
                const params = children.slice(1, -1)

                for (const param of params) {
                    if (!param) continue
                    if (!proc.execute(new Parameter(param, file), state)) return false
                }
            }

            if (descendant.type === "method_declaration") {
                const method = new MethodBase(descendant, file)
                const typeParameters = method.receiverTypeParameters()

                for (const param of typeParameters) {
                    if (!proc.execute(new TypeParameter(param, file), state)) return false
                }
            }

            if (
                descendant.type === "function_declaration" ||
                descendant.type === "method_declaration" ||
                descendant.type === "type_alias_declaration" ||
                descendant.type === "struct_declaration"
            ) {
                const typeParameters = descendant.childForFieldName("type_parameters")

                const children = typeParameters?.children ?? []
                if (children.length < 2) break
                const params = children.slice(1, -1)

                for (const param of params) {
                    if (!param) continue
                    if (!proc.execute(new TypeParameter(param, file), state)) return false
                }
            }

            if (descendant.type === "do_while_statement" && !this.forTypes) {
                const body = descendant.childForFieldName("body")
                if (body) {
                    if (!this.processBlockStatement(body, startStatement, proc, file, state)) {
                        return false
                    }
                }
            }

            if (
                descendant.type === "local_vars_declaration" ||
                descendant.type === "expression_statement"
            ) {
                startStatement = descendant
            }

            descendant = descendant.parent
        }

        return true
    }

    private processBlockStatement(
        descendant: SyntaxNode,
        startStatement: null | SyntaxNode,
        proc: ScopeProcessor,
        file: TolkFile,
        state: ResolveState,
    ): boolean {
        const statements = descendant.children
        for (const stmt of statements) {
            if (!stmt) break

            // reached the starting statement, look no further
            if (startStatement && stmt.equals(startStatement)) break

            if (stmt.type === "local_vars_declaration") {
                // val name = expr;
                //     ^^^^ this
                // val [name, other] = expr;
                //     ^^^^^^^^^^^^^ or this
                const lhs = stmt.childForFieldName("lhs")
                if (lhs) {
                    if (!this.processVariableDeclaration(lhs, proc, file, state)) {
                        return false
                    }
                }
            }
        }
        return true
    }

    private processVariableDeclaration(
        lhs: SyntaxNode,
        proc: ScopeProcessor,
        file: TolkFile,
        state: ResolveState,
    ): boolean {
        if (lhs.type === "var_declaration") {
            if (lhs.childForFieldName("redef") !== null) {
                // don't treat redef as standalone variable
                return true
            }
            if (!proc.execute(new VarDeclaration(lhs, file), state)) return false
        }

        if (lhs.type === "tuple_vars_declaration" || lhs.type === "tensor_vars_declaration") {
            const vars = lhs.childrenForFieldName("vars")
            for (const variable of vars) {
                if (!variable) continue
                if (!this.processVariableDeclaration(variable, proc, file, state)) return false
            }
        }

        return true
    }

    private processAllEntities(proc: ScopeProcessor, state: ResolveState): boolean {
        const file = this.element.file

        if (state.get("completion")) {
            if (!this.forTypes) {
                if (!index.processElsByKeyAndFile(IndexKey.Funcs, file, proc, state)) return false
                if (!index.processElsByKeyAndFile(IndexKey.GetMethods, file, proc, state))
                    return false
                if (!index.processElsByKeyAndFile(IndexKey.Constants, file, proc, state))
                    return false
                if (!index.processElsByKeyAndFile(IndexKey.GlobalVariables, file, proc, state))
                    return false
            }

            if (!index.processElsByKeyAndFile(IndexKey.Structs, file, proc, state)) return false
            if (!index.processElsByKeyAndFile(IndexKey.Enums, file, proc, state)) return false
            if (!index.processElsByKeyAndFile(IndexKey.TypeAlias, file, proc, state)) return false
        }

        // fast path, check the current file
        const fileIndex = index.findFile(file.uri)
        if (fileIndex && !this.processElsInIndex(proc, state, fileIndex)) return false

        const commonFile = index.stdlibRoot?.findRelativeFile("common.tolk")
        if (commonFile) {
            if (!this.processElsInIndex(proc, state, commonFile)) return false
        }

        const stubsFile = index.stubsRoot?.findRelativeFile("stubs.tolk")
        if (stubsFile) {
            if (!this.processElsInIndex(proc, state, stubsFile)) return false
        }

        // process imported file
        for (const path of file.importedFiles()) {
            const file = ImportResolver.toFile(path)
            if (!file) continue

            const fileIndex = index.findFile(filePathToUri(path))
            if (!fileIndex) continue

            if (!this.processElsInIndex(proc, state, fileIndex)) return false
        }

        return true
    }

    private processElsInIndex(
        proc: ScopeProcessor,
        state: ResolveState,
        fileIndex: IndexFinder,
    ): boolean {
        if (!this.forTypes) {
            const isQualifier = state.get("dot-qualifier") === "true"
            if (!isQualifier) {
                // address.foo()
                // ^^^^^^^ can be both type and function, resolve only as type
                if (!fileIndex.processElementsByKey(IndexKey.Funcs, proc, state)) return false
                if (!fileIndex.processElementsByKey(IndexKey.GetMethods, proc, state)) return false
            }
            if (!fileIndex.processElementsByKey(IndexKey.GlobalVariables, proc, state)) return false
            if (!fileIndex.processElementsByKey(IndexKey.Constants, proc, state)) return false
        }

        if (!fileIndex.processElementsByKey(IndexKey.Structs, proc, state)) return false
        if (!fileIndex.processElementsByKey(IndexKey.Enums, proc, state)) return false
        return fileIndex.processElementsByKey(IndexKey.TypeAlias, proc, state)
    }
}
