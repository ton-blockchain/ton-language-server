import {File} from "@server/psi/File"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {DeclarationNode} from "@server/languages/tlb/psi/TlbNode"

export class TlbFile extends File {
    public getDeclarations(): DeclarationNode[] {
        return this.getNodesByType("declaration", DeclarationNode)
    }

    private getNodesByType<T>(
        nodeType: string | string[],
        constructor: new (node: SyntaxNode, file: TlbFile) => T,
    ): T[] {
        const tree = this.tree
        const types = Array.isArray(nodeType) ? nodeType : [nodeType]

        return tree.rootNode.children
            .filter(node => node !== null && types.includes(node.type))
            .filter(node => node !== null)
            .map(node => new constructor(node, this))
    }
}
