//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {ResolveState} from "@server/psi/ResolveState"
import {FUNC_CACHE} from "@server/languages/func/cache"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {
    Constant,
    Func,
    GlobalVariable,
    Parameter,
    TypeParameter,
} from "@server/languages/func/psi/Decls"
import {index, IndexFinder, IndexKey} from "@server/languages/func/indexes"
import {ImportResolver} from "@server/languages/func/psi/ImportResolver"
import {filePathToUri} from "@server/files"

import type {FuncFile} from "./FuncFile"
import {Expression, NamedNode, FuncNode, VarDeclaration} from "./FuncNode"

export interface ScopeProcessor {
    execute(node: FuncNode, state: ResolveState): boolean
}

export class Reference {
    private readonly element: NamedNode
    private readonly skipBlock: boolean
    private readonly onlyBlock: boolean

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

        this.skipBlock = skipBlock
        this.onlyBlock = onlyBlock
    }

    public resolve(): NamedNode | null {
        return FUNC_CACHE.resolveCache.cached(this.element.node.id, () => this.resolveImpl())
    }

    private resolveImpl(): NamedNode | null {
        if (this.element.node.startIndex === this.element.node.endIndex) return null

        const result: NamedNode[] = []
        const state = new ResolveState()
        this.processResolveVariants(Reference.createResolveProcessor(result, this.element), state)
        if (result.length === 0) return null
        return result[0]
    }

    private static createResolveProcessor(result: FuncNode[], element: FuncNode): ScopeProcessor {
        return new (class implements ScopeProcessor {
            public execute(node: FuncNode, state: ResolveState): boolean {
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

    public processResolveVariants(proc: ScopeProcessor, state: ResolveState): boolean {
        if (this.elementIsDeclarationName()) {
            // foo: Int
            // ^^^ our element
            //
            // so process whole `foo: Int` node
            const parent = this.element.node.parent
            if (!parent) return true
            if (parent.type === "tensor_expression") {
                // catch (error)
                //        ^^^^^ this
                return proc.execute(this.element, state)
            }
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

        if (parent?.type === "tensor_expression") {
            // catch (error)
            //        ^^^^^ parent
            // ^^^^^^^^^^^^^ grand
            const grand = parent.parent
            if (grand?.type === "catch_clause") {
                return true
            }
        }

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
            parent.type === "parameter_declaration" ||
            parent.type === "var_declaration" ||
            parent.type === "function_declaration" ||
            parent.type === "get_method_declaration" ||
            parent.type === "constant_declaration"
        ) && name.equals(identifier)
    }

    private static declarationAstToNode(node: SyntaxNode, file: FuncFile): NamedNode {
        if (node.type === "constant_declaration") {
            return new Constant(node, file)
        }
        if (node.type === "global_var_declaration") {
            return new GlobalVariable(node, file)
        }
        if (node.type === "function_declaration") {
            return new Func(node, file)
        }
        if (node.type === "var_declaration") {
            return new VarDeclaration(node, file)
        }

        return new NamedNode(node, file)
    }

    private static getQualifier(node: FuncNode): Expression | null {
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
        _qualifier: Expression,
        _proc: ScopeProcessor,
        _state: ResolveState,
    ): boolean {
        // ... TODO
        return true
    }

    private processUnqualifiedResolve(proc: ScopeProcessor, state: ResolveState): boolean {
        const name = this.element.node.text
        if (!name || name === "" || name === "_") return true

        if (this.onlyBlock) {
            return this.processBlock(proc, state)
        }

        const parent = this.element.node.parent
        // foo.bar
        // ^^^ this
        const isQualifier = parent?.type === "dot_access"
        state = state.withValue("dot-qualifier", String(isQualifier))

        if (!this.skipBlock) {
            if (!this.processBlock(proc, state)) return false
        }

        return this.processAllEntities(proc, state)
    }

    public processBlock(proc: ScopeProcessor, state: ResolveState): boolean {
        const file = this.element.file
        let descendant: SyntaxNode | null = this.element.node

        let startStatement: SyntaxNode | null = null

        while (descendant) {
            // walk all variables inside block
            if (descendant.type === "block_statement") {
                if (!this.processBlockStatement(descendant, startStatement, proc, file, state)) {
                    return false
                }
            }

            // catch (error)
            // catch (error, data)
            if (descendant.type === "catch_clause") {
                // catch (error)
                //       ^^^^^^^ this
                const expr = descendant.childForFieldName("catch_expr")
                if (expr?.type === "tensor_expression") {
                    // catch (data, error)
                    //        ^^^^  ^^^^^ this
                    const expressions = expr
                        .childrenForFieldName("expressions")
                        .filter(it => it?.isNamed)

                    const [catchVar1, catchVar2] = expressions

                    if (catchVar1) {
                        if (!proc.execute(new NamedNode(catchVar1, file), state)) return false
                    }
                    if (catchVar2) {
                        if (!proc.execute(new NamedNode(catchVar2, file), state)) return false
                    }
                }
            }

            // process parameters of function
            if (descendant.type === "function_declaration") {
                const rawParameters = descendant.childForFieldName("parameters")
                const children = rawParameters?.children ?? []
                if (children.length < 2) break
                const params = children.slice(1, -1)

                for (const param of params) {
                    if (!param) continue
                    if (!proc.execute(new Parameter(param, file), state)) return false
                }
            }

            if (descendant.type === "function_declaration") {
                const typeParameters = descendant.childForFieldName("type_parameters")

                const children = typeParameters?.children ?? []
                if (children.length < 2) break
                const params = children.slice(1, -1)

                for (const param of params) {
                    if (!param) continue
                    if (!proc.execute(new TypeParameter(param, file), state)) return false
                }
            }

            if (descendant.type === "do_while_statement") {
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
        file: FuncFile,
        state: ResolveState,
    ): boolean {
        const statements = descendant.children
        for (const stmt of statements) {
            if (!stmt) break

            // reached the starting statement, look no further
            if (startStatement && stmt.equals(startStatement)) break

            if (stmt.type === "expression_statement") {
                const firstChild = stmt.firstChild
                if (firstChild?.type === "local_vars_declaration") {
                    // var name = expr;
                    //     ^^^^ this
                    // var [name, other] = expr;
                    //     ^^^^^^^^^^^^^ or this
                    const lhs = firstChild.childForFieldName("lhs")
                    if (lhs) {
                        if (!this.processVariableDeclaration(lhs, proc, file, state)) {
                            return false
                        }
                    }
                }

                if (firstChild?.type === "typed_tuple") {
                    // [_, int a, int b] = [1, 2];
                    if (!this.processVariableDeclaration(firstChild, proc, file, state)) {
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
        file: FuncFile,
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

        if (lhs.type === "typed_tuple" || lhs.type === "tensor_expression") {
            const vars = lhs.childrenForFieldName("expressions")
            for (const variable of vars) {
                if (!variable) continue
                if (!this.processVariableDeclaration(variable, proc, file, state)) return false
            }
        }

        if (lhs.type === "local_vars_declaration") {
            const innerLhs = lhs.childForFieldName("lhs")
            if (innerLhs) {
                if (!this.processVariableDeclaration(innerLhs, proc, file, state)) {
                    return false
                }
            }
        }

        return true
    }

    private processAllEntities(proc: ScopeProcessor, state: ResolveState): boolean {
        const file = this.element.file

        if (state.get("completion")) {
            if (!index.processElsByKeyAndFile(IndexKey.Funcs, file, proc, state)) return false
            if (!index.processElsByKeyAndFile(IndexKey.Constants, file, proc, state)) return false
            return index.processElsByKeyAndFile(IndexKey.GlobalVariables, file, proc, state)
        }

        // fast path, check the current file
        const fileIndex = index.findFile(file.uri)
        if (fileIndex && !this.processElsInIndex(proc, state, fileIndex)) return false

        const stubsFile = index.stubsRoot?.findRelativeFile("stubs.fc")
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

        // process all imports tree
        const visited: Set<string> = new Set([file.uri])
        const queue: string[] = file.importedFiles()

        while (queue.length > 0) {
            const path = queue.shift()
            if (!path) continue
            if (visited.has(path)) continue
            visited.add(path)

            const file = ImportResolver.toFile(path)
            if (!file) continue

            const fileIndex = index.findFile(filePathToUri(path))
            if (!fileIndex) continue

            if (!this.processElsInIndex(proc, state, fileIndex)) continue

            queue.push(...file.importedFiles())
        }

        return true
    }

    private processElsInIndex(
        proc: ScopeProcessor,
        state: ResolveState,
        fileIndex: IndexFinder,
    ): boolean {
        const isQualifier = state.get("dot-qualifier") === "true"
        if (!isQualifier) {
            // address.foo()
            // ^^^^^^^ can be both type and function, resolve only as type
            if (!fileIndex.processElementsByKey(IndexKey.Funcs, proc, state)) return false
        }
        if (!fileIndex.processElementsByKey(IndexKey.GlobalVariables, proc, state)) return false
        return fileIndex.processElementsByKey(IndexKey.Constants, proc, state)
    }
}
