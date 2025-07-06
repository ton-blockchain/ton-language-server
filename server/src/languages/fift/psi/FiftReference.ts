//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type {Node as SyntaxNode} from "web-tree-sitter"
import {RecursiveVisitor} from "@server/visitor/visitor"
import {FiftFile} from "@server/languages/fift/psi/FiftFile"

export class FiftReference {
    private readonly node: SyntaxNode
    private readonly file: FiftFile

    public constructor(node: SyntaxNode, file: FiftFile) {
        this.node = node
        this.file = file
    }

    public resolve(): SyntaxNode | null {
        if (
            this.node.type !== "identifier" &&
            !(this.node.parent?.type === "proc_call" && this.node.parent.firstChild === this.node)
        ) {
            return null
        }

        let definition: SyntaxNode | null = null
        const word = this.node.text

        RecursiveVisitor.visit(this.file.rootNode, (node): boolean => {
            if (
                node.type === "proc_definition" ||
                node.type === "proc_inline_definition" ||
                node.type === "proc_ref_definition" ||
                node.type === "method_definition"
            ) {
                const nameNode = node.childForFieldName("name")
                if (nameNode?.text === word) {
                    definition = nameNode
                    return false
                }
            }
            return true
        })

        return definition
    }

    public static resolve(node: SyntaxNode, file: FiftFile): SyntaxNode | null {
        return new FiftReference(node, file).resolve()
    }
}
