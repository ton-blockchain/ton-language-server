//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"

import {crc16} from "@server/utils/crc16"
import {parentOfType} from "@server/psi/utils"

import {Expression, NamedNode} from "./FuncNode"

export class GlobalVariable extends NamedNode {
    public override kindName(): string {
        return "global"
    }

    public typeNode(): Expression | null {
        const value = this.node.childForFieldName("type")
        if (!value) return null
        return new Expression(value, this.file)
    }
}

export class Constant extends NamedNode {
    public override kindName(): string {
        return "constant"
    }

    public value(): Expression | null {
        const value = this.node.childForFieldName("value")
        if (!value) return null
        return new Expression(value, this.file)
    }

    public typeNode(): Expression | null {
        const value = this.node.childForFieldName("type")
        if (!value) return null
        return new Expression(value, this.file)
    }

    public hasTypeHint(): boolean {
        const node = this.node.childForFieldName("type")
        return node !== null
    }
}

export class FunctionBase extends NamedNode {
    public returnType(): Expression | null {
        const result = this.node.childForFieldName("return_type")
        if (!result) return null
        return new Expression(result, this.file)
    }

    public hasParameters(): boolean {
        const parametersNode = this.node.childForFieldName("parameters")
        if (!parametersNode) return false
        return parametersNode.children.length > 2
    }

    public parameters(): Parameter[] {
        const parametersNode = this.node.childForFieldName("parameters")
        if (!parametersNode) return []

        return parametersNode.children
            .filter(value => value?.type === "parameter_declaration")
            .filter(value => value !== null)
            .map(value => new Parameter(value, this.file))
    }

    public typeParameters(): TypeParameter[] {
        const typeParametersNode = this.node.childForFieldName("type_parameters")
        if (!typeParametersNode) return []

        return typeParametersNode.children
            .filter(value => value?.type === "type_parameter")
            .filter(value => value !== null)
            .map(value => new TypeParameter(value, this.file))
    }

    public typeParametersPresentation(): string {
        const typeParametersNode = this.node.childForFieldName("type_parameters")
        if (!typeParametersNode) return ""
        return typeParametersNode.text + " "
    }

    public signaturePresentation(
        withReturnType: boolean = false,
        withTypeParameters: boolean = false,
    ): string {
        const typeParameters = this.node.childForFieldName("type_parameters")
        const typeParametersPresentation =
            withTypeParameters && typeParameters ? " " + typeParameters.text : ""

        const parametersNode = this.node.childForFieldName("parameters")
        if (!parametersNode) return ""

        const result = this.returnType()
        return (
            parametersNode.text +
            (result && withReturnType ? ` -> ${result.node.text}` : "") +
            typeParametersPresentation
        )
    }

    public get isGetMethod(): boolean {
        const specifiers = this.node.childForFieldName("specifiers")
        const methodId = specifiers?.children.find(it => it?.type === "method_id") ?? null
        return methodId !== null
    }
    public get isImpure(): boolean {
        const specifiers = this.node.childForFieldName("specifiers")
        return Boolean(specifiers?.children.find(it => it?.type === "impure"))
    }

    public get hasExplicitMethodId(): boolean {
        // check for
        // @method_id(0x1000)
        //            ^^^^^^ this
        // get fun foo() {}
        return this.getExplicitMethodId !== null
    }

    public get getExplicitMethodId(): SyntaxNode | null {
        // find
        // int foo() method_id(0x100) {}
        //                     ^^^^^ this
        const specifiers = this.node.childForFieldName("specifiers")
        const methodId = specifiers?.children.find(it => it?.type === "method_id")
        const value = methodId?.childForFieldName("value")
        return value ?? null
    }

    public computeMethodId(): number {
        const explicitId = this.getExplicitMethodId
        if (explicitId) {
            return Number.parseInt(explicitId.text)
        }

        return (crc16(Buffer.from(this.name())) & 0xff_ff) | 0x1_00_00
    }
}

export class Func extends FunctionBase {
    public override kindName(): string {
        return "fun"
    }
}

export class Parameter extends NamedNode {
    public override kindName(): string {
        return "parameter"
    }

    public typeNode(): Expression | null {
        const value = this.node.childForFieldName("type")
        if (!value) return null
        return new Expression(value, this.file)
    }
}

export class TypeParameter extends NamedNode {
    public override kindName(): string {
        return ""
    }

    public owner(): NamedNode | null {
        const owner = parentOfType(this.node, "function_declaration")
        if (!owner) return null

        if (owner.type === "function_declaration") {
            return new Func(owner, this.file)
        }

        return new NamedNode(owner, this.file)
    }
}
