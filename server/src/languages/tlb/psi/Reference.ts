//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type {Node} from "web-tree-sitter"

import {RecursiveVisitor} from "@server/visitor/visitor"
import {DeclarationNode, NamedNode, TlbNode} from "@server/languages/tlb/psi/TlbNode"
import {TlbFile} from "@server/languages/tlb/psi/TlbFile"
import {ResolveState} from "@server/psi/ResolveState"
import {parentOfType} from "@server/psi/utils"
import {TLB_CACHE} from "@server/languages/tlb/cache"

export class Reference {
    private readonly element: TlbNode
    private readonly file: TlbFile

    public static resolve(node: TlbNode | null): NamedNode | null {
        if (node === null) return null
        return new Reference(node, node.file).resolve()
    }

    public static multiResolve(node: TlbNode | null): NamedNode[] {
        if (node === null) return []
        return new Reference(node, node.file).multiResolve()
    }

    public constructor(element: TlbNode, file: TlbFile) {
        this.element = element
        this.file = file
    }

    public resolve(): NamedNode | null {
        const elements = this.multiResolve()
        return elements[0] ?? null
    }

    public multiResolve(): NamedNode[] {
        return TLB_CACHE.resolveCache.cached(this.element.node.id, () => this.resolveImpl())
    }

    public resolveImpl(): NamedNode[] {
        const result: NamedNode[] = []
        const state = new ResolveState()
        this.processResolveVariants(Reference.createResolveProcessor(result, this.element), state)
        if (result.length === 0) return []
        return result
    }

    private static createResolveProcessor(result: TlbNode[], element: TlbNode): ScopeProcessor {
        return new (class implements ScopeProcessor {
            public execute(node: TlbNode, state: ResolveState): boolean {
                if (node.node.equals(element.node)) {
                    return true
                }

                if (!(node instanceof NamedNode) || !(element instanceof NamedNode)) {
                    return true
                }

                const searchName = state.get("search-name") ?? element.name()

                if (node.name() === searchName) {
                    result.push(node)
                    return true
                }

                return true
            }
        })()
    }

    public processResolveVariants(proc: ScopeProcessor, state: ResolveState): boolean {
        const parent = this.element.node.parent
        if (parent?.type === "combinator") {
            const declaration = parent.parent
            if (declaration?.type === "declaration") {
                return proc.execute(new DeclarationNode(declaration, this.file), state)
            }
        }

        if (parentOfType(this.element.node, "type_parameter") !== null) return true

        for (const decl of this.file.getDeclarations()) {
            if (!proc.execute(decl, state)) return false
        }

        return this.processBlock(proc, state)
    }

    public processBlock(proc: ScopeProcessor, state: ResolveState): boolean {
        const rawDecl = this.element.parentOfType("declaration")
        if (!rawDecl) return true
        const decl = new DeclarationNode(rawDecl, this.file)

        for (const param of decl.parameters()) {
            if (!proc.execute(param, state)) return false
        }

        const innerParameters = decl.innerCombinatorParameters()

        for (const param of innerParameters) {
            if (!proc.execute(param, state)) return false
        }

        for (const field of decl.namedFields()) {
            if (!proc.execute(field, state)) return false
        }

        for (const field of decl.builtinFields()) {
            if (!proc.execute(field, state)) return false
        }

        return true
    }

    public static findTypeParameterNode(param: Node): Node | undefined {
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

export interface ScopeProcessor {
    execute(node: TlbNode, state: ResolveState): boolean
}
