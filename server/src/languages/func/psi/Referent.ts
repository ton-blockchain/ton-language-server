//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type {Node as SyntaxNode} from "web-tree-sitter"
import {RecursiveVisitor} from "@server/visitor/visitor"
import {NamedNode, FuncNode} from "./FuncNode"
import {Reference} from "./Reference"
import type {FuncFile} from "./FuncFile"
import {parentOfType} from "@server/psi/utils"
import {FUNC_PARSED_FILES_CACHE} from "@server/files"

/**
 * Describes a scope that contains all possible uses of a certain symbol.
 */
export interface SearchScope {
    toString(): string
}

/**
 * Describes the scope described by some AST node, the search for usages will be
 * performed only within this node.
 *
 * For example, the scope for a local variable will be the block in which it is defined.
 */
export class LocalSearchScope implements SearchScope {
    public constructor(public node: SyntaxNode) {}

    public toString(): string {
        return `LocalSearchScope:\n${this.node.text}`
    }
}

/**
 * Describes a scope consisting of one or more files.
 *
 * For example, the scope of a global function from the standard library is all project files.
 */
export class GlobalSearchScope implements SearchScope {
    public static allFiles(): GlobalSearchScope {
        const files = [...FUNC_PARSED_FILES_CACHE.values()]
        return new GlobalSearchScope(files)
    }

    public constructor(public files: FuncFile[]) {}

    public toString(): string {
        return `GlobalSearchScope:\n${this.files.map(f => `- ${f.uri}`).join("\n")}`
    }
}

export interface FindReferenceOptions {
    /**
     * if true, the first element of the result contains the definition
     */
    readonly includeDefinition?: boolean
    /**
     * if true, don't include `self` as usages (for rename)
     */
    readonly includeSelf?: boolean
    /**
     * if true, only references from the same files listed
     */
    readonly sameFileOnly?: boolean
    /**
     * search stops after `limit` number of references are found
     */
    readonly limit?: number
}

/**
 * Referent encapsulates the logic for finding all references to a definition.
 *
 * The search logic is simple, each symbol has a certain scope in which it can be used.
 * If it is a local variable, then the block in which it is defined, if a parameter, then
 * the function in which it is defined. If it is a global function, then all project files.
 *
 * When the scope is defined, it is enough to go through all the nodes from it and find those
 * that refer to the searched element.
 * For optimization, we do not try to resolve each identifier, we resolve only those that have
 * the same name as the searched element (and a bit of logic for processing `self`).
 *
 * Searching for uses of global symbols can be improved, now we use all files from the index,
 * but following the Tolk imports logic, we can reduce the search scope. For example, when searching
 * for uses of a global function defined within the project, there is no point in searching
 * for its uses within the standard library.
 * These optimizations and improvements are the object of further work.
 */
export class Referent {
    private readonly resolved: NamedNode | null = null
    private readonly file: FuncFile

    public constructor(node: SyntaxNode, file: FuncFile) {
        this.file = file
        const element = new NamedNode(node, file)
        this.resolved = Reference.resolve(element)
    }

    /**
     * Returns a list of nodes that reference the definition.
     */
    public findReferences({
        includeDefinition = false,
        sameFileOnly = false,
        limit = Infinity,
    }: FindReferenceOptions): FuncNode[] {
        const resolved = this.resolved
        if (!resolved) return []

        const useScope = this.useScope()
        if (!useScope) return []

        const result: FuncNode[] = []
        if (includeDefinition && (!sameFileOnly || resolved.file.uri === this.file.uri)) {
            const nameNode = resolved.nameNode()
            if (nameNode) {
                result.push(nameNode)
            }
        }

        this.searchInScope(useScope, sameFileOnly, result, limit)
        return result
    }

    private searchInScope(
        scope: SearchScope,
        sameFileOnly: boolean,
        result: FuncNode[],
        limit: number,
    ): void {
        if (!this.resolved) return

        if (scope instanceof LocalSearchScope) {
            this.traverseTree(this.resolved.file, scope.node, result, limit)
        }

        if (scope instanceof GlobalSearchScope) {
            if (sameFileOnly) {
                this.traverseTree(this.file, this.file.rootNode, result, limit)
                return
            }

            for (const file of scope.files) {
                this.traverseTree(file, file.rootNode, result, limit)
                if (result.length === limit) {
                    break
                }
            }
        }
    }

    private traverseTree(
        file: FuncFile,
        node: SyntaxNode,
        result: FuncNode[],
        limit: number,
    ): void {
        const resolved = this.resolved
        if (!resolved) return

        // The algorithm for finding references is simple:
        // we traverse the node that contains all the uses and resolve
        // each identifier with the same name as searched symbol.
        // If that identifier refers to the definition we are looking for,
        // we add it to the list.
        RecursiveVisitor.visit(node, (node): boolean | "stop" => {
            // fast path, skip non identifiers
            if (node.type !== "identifier" && node.type !== "type_identifier") {
                return true
            }
            // fast path, identifier name doesn't equal to definition name
            // self can refer to enclosing method
            const nodeName = node.text
            if (nodeName !== resolved.name(false)) {
                return true
            }

            const parent = node.parent
            if (parent === null) return true

            // skip definitions itself
            // prettier-ignore
            if ((
                parent.type === "global_var_declaration" ||
                parent.type === "function_declaration" ||
                parent.type === "constant_declaration" ||
                parent.type === "var_declaration" ||
                parent.type === "type_parameter" ||
                parent.type === "parameter_declaration") && parent.childForFieldName("name")?.equals(node)
            ) {
                return true
            }

            const target = Reference.resolve(new NamedNode(node, file))
            if (!target) return true

            const identifier = target.nameIdentifier()
            if (!identifier) return true

            if (
                target.node.type === resolved.node.type &&
                target.file.uri === resolved.file.uri &&
                target.node.startPosition.row === resolved.node.startPosition.row &&
                identifier.text === resolved.name(false)
            ) {
                // found new reference
                result.push(new FuncNode(node, file))
                if (result.length === limit) return "stop" // end iteration
            }
            return true
        })
    }

    /**
     * Returns the effective node in which all possible usages are expected.
     * Outside this node, no usages are assumed to exist. For example, a variable
     * can be used only in outer block statement where it is defined.
     */
    public useScope(): SearchScope | null {
        if (!this.resolved) return null

        const node = this.resolved.node

        const parent = this.resolved.node.parent
        if (parent === null) return null

        if (node.type === "var_declaration") {
            // search only in outer block/function
            const ownerBlock = parentOfType(parent, "block_statement")
            if (ownerBlock?.parent?.type === "do_while_statement") {
                // for
                // do {
                //   var a = 100;
                // } until (a);
                // search in until condition as well
                return Referent.localSearchScope(ownerBlock.parent)
            }
            return Referent.localSearchScope(ownerBlock)
        }

        if (parent.type === "catch_clause") {
            // search only in catch block
            return Referent.localSearchScope(parent.lastChild)
        }

        if (node.type === "parameter_declaration") {
            const grand = node.parent?.parent
            if (grand?.type === "function_declaration") {
                // search in function body
                return Referent.localSearchScope(grand.lastChild)
            }
        }

        if (
            node.type === "global_var_declaration" ||
            node.type === "function_declaration" ||
            node.type === "constant_declaration"
        ) {
            return GlobalSearchScope.allFiles()
        }

        if (node.type === "type_parameter") {
            return Referent.localSearchScope(parentOfType(parent, "function_declaration"))
        }

        return null
    }

    private static localSearchScope(node: SyntaxNode | null): SearchScope | null {
        if (!node) return null
        return new LocalSearchScope(node)
    }
}
