import type {Node as SyntaxNode} from "web-tree-sitter"

export abstract class BaseNode {
    public abstract node: SyntaxNode

    public parentOfType(...types: string[]): SyntaxNode | undefined {
        return parentOfType(this.node, ...types) ?? undefined
    }
}

function parentOfType(node: SyntaxNode, ...types: readonly string[]): SyntaxNode | null {
    let parent = node.parent

    for (let i = 0; i < 100; i++) {
        if (parent === null) return null
        if (types.includes(parent.type)) return parent
        parent = parent.parent
    }

    return null
}
