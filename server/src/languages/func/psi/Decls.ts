//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {Expression, NamedNode} from "./FuncNode"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {crc16} from "@server/utils/crc16"
import {parentOfType} from "@server/psi/utils"

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

export enum FunctionKind {
    Builtin = "builtin",
    Assembly = "asm",
    Common = "common",
}

export class FunctionBase extends NamedNode {
    public get body(): SyntaxNode | null {
        return this.node.childForFieldName("body")
    }

    public returnType(): Expression | null {
        const result = this.node.childForFieldName("return_type")
        if (!result) return null
        return new Expression(result, this.file)
    }

    public parameters(skipSelf: boolean = false): Parameter[] {
        const parametersNode = this.node.childForFieldName("parameters")
        if (!parametersNode) return []

        const parameters = parametersNode.children
            .filter(value => value?.type === "parameter_declaration")
            .filter(value => value !== null)
            .map(value => new Parameter(value, this.file))

        if (skipSelf && parameters.length > 0 && parameters[0].name() === "self") {
            return parameters.slice(1)
        }

        return parameters
    }

    public typeParameters(): TypeParameter[] {
        const typeParametersNode = this.node.childForFieldName("type_parameters")
        if (!typeParametersNode) return []

        return typeParametersNode.children
            .filter(value => value?.type === "type_parameter")
            .filter(value => value !== null)
            .map(value => new TypeParameter(value, this.file))
    }

    public signaturePresentation(withTypeParameters: boolean = false): string {
        const typeParameters = this.node.childForFieldName("type_parameters")
        const typeParametersPresentation =
            withTypeParameters && typeParameters ? typeParameters.text : ""

        const parametersNode = this.node.childForFieldName("parameters")
        if (!parametersNode) return ""

        const result = this.returnType()
        return (
            typeParametersPresentation +
            parametersNode.text +
            (result ? `: ${result.node.text}` : "")
        )
    }

    public kind(): FunctionKind {
        const builtin = this.node.childForFieldName("builtin_specifier")
        if (builtin) {
            // fun bar() builtin
            return FunctionKind.Builtin
        }
        const asmBody = this.node.childForFieldName("asm_body")
        if (asmBody) {
            // fun bar() asm "POP"
            return FunctionKind.Assembly
        }
        // fun bar() { ... }
        return FunctionKind.Common
    }

    public isInstanceMethod(): boolean {
        const receiver = this.node.childForFieldName("receiver")
        if (!receiver) {
            // fun foo() {}
            return false
        }

        const parameters = this.parameters()
        if (parameters.length === 0) {
            // fun Bar.foo()
            return false
        }

        // fun Bar.bar(self)
        const first = parameters[0]
        return first.name() === "self"
    }

    public isStaticMethod(): boolean {
        const receiver = this.node.childForFieldName("receiver")
        if (!receiver) {
            // fun foo() {}
            return false
        }

        const parameters = this.parameters()
        if (parameters.length === 0) {
            // fun Bar.foo()
            return true
        }

        // fun Bar.bar(some: int)
        const first = parameters[0]
        return first.name() !== "self"
    }

    public closeParameterListParen(): SyntaxNode | null {
        const parametersNode = this.node.childForFieldName("parameters")
        if (!parametersNode) return null
        return parametersNode.children.at(-1) ?? null
    }

    public openBrace(): SyntaxNode | null {
        const body = this.node.childForFieldName("body")
        if (!body) return null
        return body.firstChild
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
        // @method_id(0x1000)
        //            ^^^^^^ this
        // get fun foo() {}
        const annotations = this.node.childForFieldName("annotations")
        if (!annotations) return null
        const methodId = annotations.children.find(
            it => it?.childForFieldName("name")?.text === "method_id",
        )
        if (!methodId) return null
        const argsNode = methodId.childForFieldName("arguments")
        if (!argsNode) return null
        const args = argsNode.namedChildren
        return args.at(0) ?? null
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

export class GetMethod extends FunctionBase {
    public override kindName(): string {
        return "get fun"
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

    public defaultValuePresentation(): string {
        const defaultValueNode = this.node.childForFieldName("default")
        if (!defaultValueNode) return ""
        return ` = ${defaultValueNode.text}`
    }

    public defaultValue(): Expression | null {
        const valueNode = this.node.childForFieldName("default")
        if (valueNode === null) return null
        return new Expression(valueNode, this.file)
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

    public defaultTypePresentation(): string {
        const defaultValueNode = this.node.childForFieldName("default")
        if (!defaultValueNode) return ""
        return ` = ${defaultValueNode.text}`
    }

    public defaultType(): SyntaxNode | null {
        return this.node.childForFieldName("default")
    }

    public override name(): string {
        if (this.node.type === "type_identifier") {
            // if T in `fun Foo<T>.bar() {}`
            return this.node.text
        }
        return super.name()
    }
}
