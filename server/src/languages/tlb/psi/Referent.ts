//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type {Node as SyntaxNode} from "web-tree-sitter"
import {RecursiveVisitor} from "@server/visitor/visitor"

import {BaseReferent, GlobalSearchScope, LocalSearchScope} from "@server/references/referent"

import {File} from "@server/psi/File"

import {NamedNode, TlbNode} from "./TlbNode"
import {Reference} from "./Reference"
import type {TlbFile} from "./TlbFile"

export class Referent extends BaseReferent<NamedNode> {
    public readonly resolved: NamedNode | null = null

    public constructor(node: SyntaxNode, file: TlbFile) {
        super(file)
        const element = new NamedNode(node, file)
        this.resolved = Reference.resolve(element)
    }

    public override traverseTree(
        file: TlbFile,
        node: SyntaxNode,
        result: TlbNode[],
        limit: number,
    ): void {
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

            const targets = Reference.multiResolve(new NamedNode(node, file))
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

    public override useScope(): LocalSearchScope | GlobalSearchScope<File> | null {
        if (!this.resolved) return null
        return new GlobalSearchScope([this.file])
    }
}
