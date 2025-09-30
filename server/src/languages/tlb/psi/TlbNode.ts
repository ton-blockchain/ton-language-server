import type {Node, Node as SyntaxNode} from "web-tree-sitter"

import {TlbFile} from "@server/languages/tlb/psi/TlbFile"
import {BaseNode} from "@server/psi/BaseNode"
import {RecursiveVisitor} from "@server/visitor/visitor"

export class TlbNode extends BaseNode {
    public readonly node: SyntaxNode
    public readonly file: TlbFile

    public constructor(node: SyntaxNode, file: TlbFile) {
        super()
        this.node = node
        this.file = file
    }
}

export class NamedNode extends TlbNode {
    public nameIdentifier(): SyntaxNode | null {
        if (this.node.type === "identifier" || this.node.type === "type_identifier") {
            return this.node
        }

        const nameNode = this.node.childForFieldName("name")
        if (!nameNode) {
            return null
        }
        return nameNode
    }

    public nameNode(): NamedNode | null {
        const node = this.nameIdentifier()
        if (!node) return null
        return new NamedNode(node, this.file)
    }

    public name(): string {
        const ident = this.nameIdentifier()
        if (ident === null) return ""
        return ident.text
    }
}

export class NamedFieldNode extends NamedNode {}

export class ParameterNode extends NamedNode {
    public owner(): NamedNode | undefined {
        const parentCombinatorExpr = this.parentOfType("combinator_expr")
        if (parentCombinatorExpr !== undefined) {
            return new NamedNode(parentCombinatorExpr, this.file)
        }

        const parentCombinator = this.parentOfType("combinator")
        if (parentCombinator !== undefined) {
            return new NamedNode(parentCombinator, this.file)
        }

        return undefined
    }
}

export class DeclarationNode extends NamedNode {
    public override name(): string {
        return this.nameIdentifier()?.text ?? ""
    }

    public override nameIdentifier(): SyntaxNode | null {
        const combinator = this.combinator()
        if (!combinator) return null
        return combinator.childForFieldName("name")
    }

    /**
     * foo = Foo x y;
     * //    ^^^^^^^ this
     */
    public combinator(): SyntaxNode | null {
        return this.node.childForFieldName("combinator")
    }

    /**
     * foo = Foo x y;
     * //        ^ ^
     * //        | this
     * //        and this
     */
    public parameters(): ParameterNode[] {
        const combinator = this.combinator()
        return this.combinatorParameters(combinator)
    }

    /**
     * phm_edge#_ {l:#} {m:#} label:(HmLabel ~l n) = PfxHashmap n X;
     * //                                     ^ ^
     * //                                     | this
     * //                                     and this
     */
    public innerCombinatorParameters(): ParameterNode[] {
        const combinators = this.innerCombinators()
        return combinators.flatMap(combinator => this.combinatorParameters(combinator))
    }

    /**
     * phm_edge#_ {l:#} {m:#} label:(HmLabel ~l n) = PfxHashmap n X;
     * //                            ^^^^^^^^^^^^ this
     */
    public innerCombinators(): SyntaxNode[] {
        const result: SyntaxNode[] = []

        RecursiveVisitor.visit(this.node, n => {
            if (n.type === "combinator_expr") {
                result.push(n)
            }
            return true
        })

        return result
    }

    public fields(): SyntaxNode[] {
        return this.node.children
            .filter(it => it?.type === "field")
            .map(it => it?.firstChild)
            .filter(it => it !== null && it !== undefined)
    }

    public namedFields(): NamedFieldNode[] {
        return this.node.children
            .filter(it => it?.type === "field")
            .map(it => it?.firstChild)
            .filter(it => it !== null && it !== undefined)
            .filter(it => it.type !== "field_named")
            .map(it => new NamedFieldNode(it, this.file))
    }

    public builtinFields(): NamedFieldNode[] {
        return this.node.children
            .filter(it => it?.type === "field")
            .map(it => it?.firstChild)
            .filter(it => it !== null && it !== undefined)
            .filter(it => it.type !== "field_builtin")
            .map(it => new NamedFieldNode(it, this.file))
    }

    private combinatorParameters(combinator: SyntaxNode | null): ParameterNode[] {
        const params = combinator?.childrenForFieldName("params").filter(it => it !== null) ?? []

        const result: ParameterNode[] = []

        for (const param of params) {
            const nameNode = DeclarationNode.findTypeParameterNode(param)
            if (!nameNode) continue
            result.push(new ParameterNode(nameNode, this.file))
        }

        return result
    }

    private static findTypeParameterNode(param: Node): Node | undefined {
        let paramNode: Node | undefined = undefined

        RecursiveVisitor.visit(param, n => {
            if (n.type === "type_identifier") {
                paramNode = n
            }
            return true
        })

        return paramNode
    }
}
