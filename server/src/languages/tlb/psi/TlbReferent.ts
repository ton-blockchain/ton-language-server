//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type {Node as SyntaxNode} from "web-tree-sitter"
import {RecursiveVisitor} from "@server/visitor/visitor"
import {NamedNode, TlbNode} from "./TlbNode"
import {TlbReference} from "./TlbReference"
import type {TlbFile} from "./TlbFile"
import {
    FindReferencesOptions,
    GlobalSearchScope,
    LocalSearchScope,
} from "@server/references/referent"

/**
 * Referent encapsulates the logic for finding all TlbReferences to a definition.
 */
export class TlbReferent {
    private readonly resolved: NamedNode | null = null
    private readonly file: TlbFile

    public constructor(node: SyntaxNode, file: TlbFile) {
        this.file = file
        const element = new NamedNode(node, file)
        this.resolved = TlbReference.resolve(element)
    }

    /**
     * Returns a list of nodes that reference the definition.
     */
    public findReferences({
        includeDefinition = false,
        sameFileOnly = false,
        limit = Infinity,
    }: FindReferencesOptions): TlbNode[] {
        const resolved = this.resolved
        if (!resolved) return []

        const useScope = this.useScope()
        if (!useScope) return []

        const result: TlbNode[] = []
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
        scope: LocalSearchScope | GlobalSearchScope<TlbFile>,
        sameFileOnly: boolean,
        result: TlbNode[],
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

    private traverseTree(file: TlbFile, node: SyntaxNode, result: TlbNode[], limit: number): void {
        const resolved = this.resolved
        if (!resolved) return

        // The algorithm for finding TlbReferences is simple:
        // we traverse the node that contains all the uses and resolve
        // each identifier with the same name as searched symbol.
        // If that identifier refers to the definition we are looking for,
        // we add it to the list.
        RecursiveVisitor.visit(node, (node): boolean | "stop" => {
            // fast path, skip non-identifiers
            if (node.type !== "identifier" && node.type !== "type_identifier") {
                return true
            }

            // fast path, identifier name doesn't equal to definition name
            const nodeName = node.text
            if (nodeName !== resolved.name()) {
                return true
            }

            const parent = node.parent
            if (parent === null) return true

            if (parent.type === "combinator") {
                return true
            }

            const targets = TlbReference.multiResolve(new NamedNode(node, file))
            if (targets.length === 0) return true

            for (const res of targets) {
                const identifier = res.nameIdentifier()
                if (!identifier) continue

                if (
                    res.node.type === resolved.node.type &&
                    res.file.uri === resolved.file.uri &&
                    res.node.startPosition.row === resolved.node.startPosition.row &&
                    (identifier.text === resolved.name() || identifier.text === "self")
                ) {
                    // found new TlbReference
                    result.push(new TlbNode(node, file))
                    if (result.length === limit) {
                        return "stop" // end iteration}
                    }
                }
            }
            return true
        })
    }

    /**
     * Returns the effective node in which all possible usages are expected.
     * Outside this node, no usages are assumed to exist. For example, a variable
     * can be used only in an outer block statement where it is defined.
     */
    public useScope(): LocalSearchScope | GlobalSearchScope<TlbFile> | null {
        if (!this.resolved) return null

        return new GlobalSearchScope([this.file])
    }
}
