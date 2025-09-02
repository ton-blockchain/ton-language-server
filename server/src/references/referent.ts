import type {Node as SyntaxNode} from "web-tree-sitter"
import {File} from "@server/psi/File"

/**
 * Describes a scope that contains all possible uses of a certain symbol.
 */
export interface SearchScope {
    toString(): string
}

/**
 * Describes the scope described by some AST node; the search for usages will be
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
export class GlobalSearchScope<TFile extends File> implements SearchScope {
    public constructor(public files: TFile[]) {}

    public toString(): string {
        return `GlobalSearchScope:\n${this.files.map(f => `- ${f.uri}`).join("\n")}`
    }
}

export interface FindReferencesOptions {
    /**
     * if true, the first element of the result contains the definition
     */
    readonly includeDefinition?: boolean
    /**
     * if true, only references from the same files listed
     */
    readonly sameFileOnly?: boolean
    /**
     * search stops after `limit` number of references are found
     */
    readonly limit?: number
}

export abstract class NamedNode {
    public abstract file: File

    public abstract nameIdentifier(): SyntaxNode | null

    public abstract nameNode(): NamedNode | null

    public abstract name(): string
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
 */
export abstract class BaseReferent<Node extends NamedNode> {
    public abstract readonly resolved: Node | null
    public readonly file: File

    protected constructor(file: File) {
        this.file = file
    }

    /**
     * Returns a list of nodes that reference the definition.
     */
    public findReferences({
        includeDefinition = false,
        sameFileOnly = false,
        limit = Infinity,
    }: FindReferencesOptions): Node[] {
        const resolved = this.resolved
        if (!resolved) return []

        const useScope = this.useScope()
        if (!useScope) return []

        const result: Node[] = []
        if (includeDefinition && (!sameFileOnly || resolved.file.uri === this.file.uri)) {
            const nameNode = resolved.nameNode()
            if (nameNode) {
                // @ts-expect-error idk
                result.push(nameNode)
            }
        }

        this.searchInScope(useScope, sameFileOnly, result, limit)
        return result
    }

    private searchInScope(
        scope: LocalSearchScope | GlobalSearchScope<File>,
        sameFileOnly: boolean,
        result: Node[],
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

    public abstract traverseTree(file: File, node: SyntaxNode, result: Node[], limit: number): void

    /**
     * Returns the effective node in which all possible usages are expected.
     * Outside this node, no usages are assumed to exist. For example, a variable
     * can be used only in an outer block statement where it is defined.
     */
    public abstract useScope(): LocalSearchScope | GlobalSearchScope<File> | null
}
