//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"

import {BaseNode} from "@server/psi/BaseNode"
import {parentOfType} from "@server/psi/utils"
import {extractCommentsDoc} from "@server/psi/comments"

import {FuncFile} from "./FuncFile"

export class FuncNode extends BaseNode {
    public node: SyntaxNode
    public file: FuncFile

    public constructor(node: SyntaxNode, file: FuncFile) {
        super()
        this.node = node
        this.file = file
    }
}

export class Expression extends FuncNode {}

export class CallLike extends Expression {
    public callee(): SyntaxNode | null {
        return this.node.childForFieldName("callee")
    }

    public calleeName(): SyntaxNode | null {
        const callee = this.node.childForFieldName("callee")
        if (callee?.type === "identifier") {
            return callee
        }
        if (callee?.type === "dot_access") {
            return callee.childForFieldName("field")
        }
        if (callee?.type === "generic_instantiation") {
            return callee
        }
        if (callee?.type === "function_call") {
            const call = new CallLike(callee, this.file)
            return call.calleeName()
        }
        return null
    }

    public calleeQualifier(): SyntaxNode | null {
        const callee = this.node.childForFieldName("callee")
        return this.qualifier(callee)
    }

    private qualifier(callee: SyntaxNode | null): SyntaxNode | null {
        if (callee?.type === "identifier") {
            return null
        }
        if (callee?.type === "dot_access") {
            return callee.childForFieldName("obj")
        }
        if (callee?.type === "generic_instantiation") {
            return this.qualifier(callee.childForFieldName("expr"))
        }
        if (callee?.type === "function_call") {
            return null
        }
        return null
    }

    public rawArguments(): SyntaxNode[] {
        const node = this.node.childForFieldName("arguments")
        if (!node) return []
        return node.children.filter(it => it !== null)
    }

    public arguments(): SyntaxNode[] {
        return this.rawArguments().filter(it => it.type === "call_argument")
    }
}

export class NamedNode extends FuncNode {
    public static create(node: SyntaxNode, file: FuncFile): NamedNode {
        return new NamedNode(node, file)
    }

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

    public name(trimBackticks: boolean = true): string {
        const ident = this.nameIdentifier()
        if (ident === null) return ""
        const text = ident.text
        if (trimBackticks && text.startsWith("`") && text.endsWith("`")) {
            return text.slice(1, -1)
        }
        return text
    }

    public namePresentation(): string {
        return this.name(false)
    }

    public kindName(): string {
        return "decl"
    }

    public documentation(): string {
        return extractCommentsDoc(this.node)
    }
}

export class VariablesDeclaration extends FuncNode {
    public kind(): string {
        return this.node.childForFieldName("kind")?.text ?? "val"
    }

    public lhs(): SyntaxNode | null {
        return this.node.childForFieldName("lhs")
    }

    public tupleOrTensor(): boolean {
        const lhs = this.lhs()
        if (!lhs) return false
        return lhs.type === "tuple_vars_declaration" || lhs.type === "tensor_vars_declaration"
    }

    public value(): SyntaxNode | null {
        return this.node.childForFieldName("assigned_val")
    }
}

export class VarDeclaration extends NamedNode {
    public override kindName(): string {
        return "var"
    }

    public varsDeclaration(): VariablesDeclaration | null {
        const decl = parentOfType(this.node, "local_vars_declaration")
        if (!decl) return null
        return new VariablesDeclaration(decl, this.file)
    }

    public typeHint(): Expression | null {
        const node = this.node.childForFieldName("type")
        if (!node) return null
        return new Expression(node, this.file)
    }

    public hasTypeHint(): boolean {
        const node = this.node.childForFieldName("type")
        return node !== null
    }

    public value(): Expression | null {
        const parentDecl = parentOfType(this.node, "local_vars_declaration")
        if (!parentDecl) return null
        const val = parentDecl.childForFieldName("assigned_val")
        if (!val) return null
        return new Expression(val, this.file)
    }
}
