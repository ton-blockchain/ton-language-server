//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type {Node as SyntaxNode} from "web-tree-sitter"
import {RecursiveVisitor} from "@server/visitor/visitor"

import {FiftFile} from "@server/languages/fift/psi/FiftFile"
import {FiftNode} from "@server/languages/fift/psi/FiftNode"

import {FiftReference} from "./FiftReference"

export class FiftReferent {
    private readonly node: SyntaxNode
    private readonly file: FiftFile
    private readonly resolved: SyntaxNode | null = null

    public constructor(node: SyntaxNode, file: FiftFile) {
        this.node = node
        this.file = file
        this.resolved = FiftReference.resolve(node, file)
    }

    public findReferences(includeDefinition: boolean = false): FiftNode[] {
        if (!this.resolved) return []

        const result: FiftNode[] = []
        if (includeDefinition) {
            result.push(new FiftNode(this.resolved, this.file))
        }

        const word = this.resolved.text

        RecursiveVisitor.visit(this.file.rootNode, (node): boolean => {
            if (node.type !== "identifier") return true
            if (node.text !== word) return true

            const parent = node.parent
            if (!parent) return true

            if (
                (parent.type === "proc_definition" ||
                    parent.type === "proc_inline_definition" ||
                    parent.type === "method_definition" ||
                    parent.type === "declaration") &&
                parent.childForFieldName("name")?.equals(node)
            ) {
                return true
            }

            const def = FiftReference.resolve(node, this.file)
            if (def?.equals(this.node)) {
                result.push(new FiftNode(node, this.file))
            }

            return true
        })

        return result
    }
}
