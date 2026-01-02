//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"

import {crc16} from "@server/utils/crc16"
import {parentOfType} from "@server/psi/utils"
import {RecursiveVisitor} from "@server/visitor/visitor"
import {Reference} from "@server/languages/tolk/psi/Reference"
import {EnumTy, Ty} from "@server/languages/tolk/types/ty"
import {typeOf} from "@server/languages/tolk/type-inference"

import {Expression, NamedNode} from "./TolkNode"

export class GlobalVariable extends NamedNode {
    public override kindName(): string {
        return "global"
    }

    public declaredType(): Ty | null {
        return typeOf(this.node, this.file)
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

    public declaredType(): Ty | null {
        return typeOf(this.node, this.file)
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

export class MethodBase extends FunctionBase {
    public override kindName(): string {
        return "fun"
    }

    public receiver(): SyntaxNode | null {
        // fun Foo<T>.bar() {}
        //     ^^^^^^^ this
        return this.node.childForFieldName("receiver")
    }

    public receiverTypeNode(): SyntaxNode | null {
        const receiver = this.receiver()
        return receiver?.childForFieldName("receiver_type") ?? null
    }

    public receiverTypeString(): string {
        const receiver = this.receiver()
        const type = receiver?.childForFieldName("receiver_type") ?? null
        if (!type) return ""
        return type.text
    }

    public receiverTypeParameters(): SyntaxNode[] {
        const receiver = this.receiverTypeNode()
        if (!receiver) return []

        if (receiver.type === "type_identifier") {
            // simple case
            // fun builder.foo() {}
            // or
            // fun T.foo() {}

            const resolved = Reference.resolve(new NamedNode(receiver, this.file), true)
            if (resolved instanceof TypeParameter) {
                return [receiver]
            }
            return []
        }

        const potentialTypeParameters: SyntaxNode[] = []

        RecursiveVisitor.visit(receiver, n => {
            if (n.type === "identifier" || n.type === "type_identifier") {
                const resolved = Reference.resolve(new NamedNode(n, this.file), true)
                if (resolved instanceof TypeParameter) {
                    potentialTypeParameters.push(n)
                }
                return true
            }

            if (n.type === "type_instantiatedTs") {
                // Foo<T>
                const argsNode = n.childForFieldName("arguments")
                if (!argsNode) return true

                const args = argsNode.namedChildren
                for (const arg of args) {
                    // T in Foo<T>
                    if (arg?.type === "type_identifier") {
                        const resolved = Reference.resolve(new NamedNode(arg, this.file), true)
                        if (resolved) {
                            if (resolved.node.equals(arg)) {
                                // resolved to itself
                                potentialTypeParameters.push(arg)
                            }
                        }
                    }
                }
            }
            return true
        })

        return potentialTypeParameters
    }

    public override namePresentation(): string {
        return this.receiverTypeString() + "." + this.name()
    }
}

export class InstanceMethod extends MethodBase {
    public isMutating(): boolean {
        const parameters = this.parameters()
        if (parameters.length === 0) return false
        const first = parameters[0]
        return first.isMutable()
    }
}

export class StaticMethod extends MethodBase {}

export class GetMethod extends FunctionBase {
    public override kindName(): string {
        return "get fun"
    }

    public isTest(): boolean {
        const name = this.name(true)
        return name.startsWith("test ") || name.startsWith("test_") || name.startsWith("test-")
    }
}

export class Parameter extends NamedNode {
    public override kindName(): string {
        return "parameter"
    }

    public declaredType(): Ty | null {
        return typeOf(this.node, this.file)
    }

    public isMutable(): boolean {
        return this.node.firstChild?.text === "mutate"
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

export class TypeAlias extends NamedNode {
    public override kindName(): string {
        return "type"
    }

    public underlyingType(): SyntaxNode | null {
        return this.node.childForFieldName("underlying_type")
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
        const typeParameters = this.node.childForFieldName("type_parameters")
        if (!typeParameters) return ""
        return typeParameters.text
    }
}

export class TypeParameter extends NamedNode {
    public override kindName(): string {
        return ""
    }

    public owner(): NamedNode | null {
        const owner = parentOfType(
            this.node,
            "function_declaration",
            "method_declaration",
            "struct_declaration",
            "type_alias_declaration",
        )
        if (!owner) return null

        if (owner.type === "function_declaration") {
            return new Func(owner, this.file)
        }

        if (owner.type === "method_declaration") {
            return new MethodBase(owner, this.file)
        }

        if (owner.type === "struct_declaration") {
            return new Struct(owner, this.file)
        }

        if (owner.type === "type_alias_declaration") {
            return new TypeAlias(owner, this.file)
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

export class FieldsOwner extends NamedNode {
    public fields(): Field[] {
        const body = this.node.childForFieldName("body")
        if (!body) return []
        return body.children
            .filter(value => value?.type === "struct_field_declaration")
            .filter(value => value !== null)
            .map(value => new Field(value, this.file))
    }
}

export class Struct extends FieldsOwner {
    public override kindName(): string {
        return "struct"
    }

    public body(): SyntaxNode | null {
        return this.node.childForFieldName("body")
    }

    public typeParametersPresentation(): string {
        const typeParameters = this.node.childForFieldName("type_parameters")
        if (!typeParameters) return ""
        return typeParameters.text
    }

    public typeParameters(): TypeParameter[] {
        const typeParametersNode = this.node.childForFieldName("type_parameters")
        if (!typeParametersNode) return []

        return typeParametersNode.children
            .filter(value => value?.type === "type_parameter")
            .filter(value => value !== null)
            .map(value => new TypeParameter(value, this.file))
    }

    public packPrefix(): SyntaxNode | null {
        // struct (0x100) Foo {}
        //         ^^^^^ this
        return this.node.childForFieldName("pack_prefix")
    }
}

export class Field extends NamedNode {
    public override kindName(): string {
        return "field"
    }

    public typeNode(): Expression | null {
        const value = this.node.childForFieldName("type")
        if (!value) return null
        return new Expression(value, this.file)
    }

    public owner(): Struct | null {
        const ownerNode = this.parentOfType("struct_declaration")
        if (!ownerNode) return null
        return new Struct(ownerNode, this.file)
    }

    public isPrivate(): boolean {
        const modifiers = this.node.childForFieldName("modifiers")
        if (!modifiers) return false
        return modifiers.children.some(it => it?.text === "private")
    }

    public modifiers(): string[] {
        const modifiers = this.node.childForFieldName("modifiers")
        if (!modifiers) return []
        return modifiers.children
            .map(it => it?.text ?? "")
            .filter(it => it === "readonly" || it === "private")
    }

    public modifiersPresentation(): string {
        const modifiers = this.modifiers().join(" ")
        if (modifiers === "") return ""
        return modifiers + " "
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

export class Enum extends NamedNode {
    public override kindName(): string {
        return "enum"
    }

    public declaredType(): EnumTy {
        return new EnumTy(this.name(), this)
    }

    public backedType(): SyntaxNode | null {
        return this.node.childForFieldName("backed_type")
    }

    public body(): SyntaxNode | null {
        return this.node.childForFieldName("body")
    }

    public members(): EnumMember[] {
        const body = this.node.childForFieldName("body")
        if (!body) return []
        return body.children
            .filter(value => value?.type === "enum_member_declaration")
            .filter(value => value !== null)
            .map(value => new EnumMember(value, this.file))
    }
}

export class EnumMember extends NamedNode {
    public override kindName(): string {
        return "enum member"
    }

    public owner(): Enum | null {
        const ownerNode = this.parentOfType("enum_declaration")
        if (!ownerNode) return null
        return new Enum(ownerNode, this.file)
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

export function isSpecialStruct(name: string): boolean {
    return name === "contract" || name === "blockchain" || name === "random" || name === "debug"
}
