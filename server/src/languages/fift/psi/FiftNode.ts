import type {Node as SyntaxNode} from "web-tree-sitter"
import {FiftFile} from "@server/languages/fift/psi/FiftFile"

export class FiftNode {
    public readonly node: SyntaxNode
    public readonly file: FiftFile

    public constructor(node: SyntaxNode, file: FiftFile) {
        this.node = node
        this.file = file
    }
}
