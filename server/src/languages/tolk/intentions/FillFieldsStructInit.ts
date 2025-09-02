//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Intention, IntentionContext} from "@server/languages/tolk/intentions/Intention"
import type {WorkspaceEdit} from "vscode-languageserver"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {asLspPosition, asParserPoint} from "@server/utils/position"
import type {Position} from "vscode-languageclient"
import {FileDiff} from "@server/utils/FileDiff"
import {parentOfType} from "@server/psi/utils"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {
    BitsNTy,
    BoolTy,
    BuiltinTy,
    BytesNTy,
    CoinsTy,
    EnumTy,
    FieldsOwnerTy,
    InstantiationTy,
    IntTy,
    NullTy,
    StructTy,
    TensorTy,
    TupleTy,
    Ty,
    TypeAliasTy,
    UnionTy,
} from "@server/languages/tolk/types/ty"
import type {Field} from "@server/languages/tolk/psi/Decls"
import {typeOf} from "@server/languages/tolk/type-inference"

export class FillStructInitBase implements Intention {
    public readonly id: string = "tolk.fill-struct-init-base"
    public readonly name: string = "Fill all fields..."

    public constructor(private readonly allFields: boolean) {}

    private static findInstanceExpression(ctx: IntentionContext): SyntaxNode | null {
        const referenceNode = nodeAtPosition(ctx.position, ctx.file)
        if (!referenceNode) return null
        const initExpr = parentOfType(referenceNode, "object_literal")
        if (!initExpr) return null
        return initExpr
    }

    public isAvailable(ctx: IntentionContext): boolean {
        const instance = FillStructInitBase.findInstanceExpression(ctx)
        if (!instance) return false
        const argumentsNode = instance.childForFieldName("arguments")
        if (!argumentsNode) return false
        const args = argumentsNode.children
            .filter(it => it?.type === "instance_argument")
            .filter(it => it !== null)

        if (args.length > 0) {
            return false
        }

        // val some = Foo{}
        //            ^^^ this
        const type = typeOf(instance, ctx.file)?.baseType()
        if (!type) {
            // available only if struct is known
            return false
        }

        if (type instanceof FieldsOwnerTy) {
            return type.fields().length > 0
        }

        return false
    }

    private static findBraces(instance: SyntaxNode): {
        openBrace: SyntaxNode
        closeBrace: SyntaxNode
    } | null {
        const args = instance.childForFieldName("arguments")
        if (!args) return null

        const openBrace = args.children[0]
        const closeBrace = args.children.at(-1)
        if (!openBrace || !closeBrace) return null
        return {openBrace, closeBrace}
    }

    private static findIndent(ctx: IntentionContext, instance: SyntaxNode): number {
        const lines = ctx.file.content.split(/\r?\n/)
        const line = lines[instance.startPosition.row]
        const lineTrim = line.trimStart()
        return line.indexOf(lineTrim)
    }

    public invoke(ctx: IntentionContext): WorkspaceEdit | null {
        const instance = FillStructInitBase.findInstanceExpression(ctx)
        if (!instance) return null

        // val some = Foo{}
        //            ^^^ this
        const type = typeOf(instance, ctx.file)?.baseType()
        if (!type) {
            // available only if struct is known
            return null
        }
        if (!(type instanceof FieldsOwnerTy)) return null

        const braces = FillStructInitBase.findBraces(instance)
        if (!braces) return null

        //    val some = Foo{}
        //                  ^^ these
        const {openBrace, closeBrace} = braces

        //    val some = Foo{}
        //^^^^ this
        const indent = FillStructInitBase.findIndent(ctx, instance)

        //    val some = Foo{
        //        field: 1,
        //^^^^^^^^ this
        const fieldIndent = " ".repeat(indent + 4)

        //    val some = Foo{
        //        field: 1,
        //    }
        //^^^^ this
        const closeBraceIndent = " ".repeat(indent)

        const fields = type.fields().filter(field => {
            // if `allFields` is false, filter all fields with default value
            return this.allFields || field.defaultValue() === null
        })

        if (fields.length === 0) return null // no fields to init

        //       field: false,
        //       other: null,
        const fieldsPresentation = fields
            .map(field => {
                const name = field.name()
                const value = FillStructInitBase.fieldDefaultValue(field)
                return `${fieldIndent}${name}: ${value},`
            })
            .join("\n")

        //    val some = Foo{}
        //                  ^^
        const singleLine = openBrace.startPosition.row === closeBrace.endPosition.row

        //    val some = Foo{
        //    }
        //    ^ don't add extra new line here
        const newLine = singleLine ? "\n" : ""
        const suffix = newLine === "" ? "" : `${newLine}${closeBraceIndent}`

        const diff = FileDiff.forFile(ctx.file.uri)
        diff.appendTo(asLspPosition(openBrace.endPosition), `\n${fieldsPresentation}${suffix}`)

        return diff.toWorkspaceEdit()
    }

    private static fieldDefaultValue(field: Field): string {
        const defaultValue = field.defaultValue()
        if (defaultValue) return defaultValue.node.text

        const type = typeOf(field.node, field.file)
        if (!type) return "null"

        return this.typeDefaultValue(type)
    }

    private static typeDefaultValue(type: Ty | BuiltinTy | StructTy | EnumTy | TupleTy): string {
        if (type instanceof NullTy) {
            return "null"
        }

        if (type instanceof UnionTy && type.elements.some(it => it instanceof NullTy)) {
            return "null"
        }

        if (type instanceof BoolTy) {
            return "false"
        }

        if (type instanceof CoinsTy) {
            return 'ton("0.1")'
        }

        if (type instanceof IntTy) {
            return "0"
        }

        if (type instanceof BitsNTy || type instanceof BytesNTy) {
            return "createEmptySlice()"
        }

        if (type instanceof BuiltinTy) {
            const name = type.name()

            switch (name) {
                case "address": {
                    return 'address("")'
                }
                case "cell": {
                    return "createEmptyCell()"
                }
                case "builder": {
                    return "beginCell()"
                }
                case "slice": {
                    return "createEmptySlice()"
                }
            }
        }

        if (type instanceof StructTy) {
            return `${type.name()} {}`
        }

        if (type instanceof EnumTy) {
            // Color.Red or Color
            return type.anchor?.members()[0]?.name() ?? type.name()
        }

        if (type instanceof TupleTy) {
            return `[${type.elements.map(it => this.typeDefaultValue(it)).join(", ")}]`
        }

        if (type instanceof TensorTy) {
            return `(${type.elements.map(it => this.typeDefaultValue(it)).join(", ")})`
        }

        if (type instanceof UnionTy) {
            return this.typeDefaultValue(type.elements[0])
        }

        if (type instanceof TypeAliasTy) {
            return this.typeDefaultValue(type.innerTy)
        }

        if (type instanceof InstantiationTy) {
            if (
                type.innerTy instanceof StructTy &&
                type.innerTy.name() === "Cell" &&
                type.types.length > 0
            ) {
                return this.typeDefaultValue(type.types[0]) + ".toCell()"
            }
            return this.typeDefaultValue(type.innerTy)
        }

        return "null"
    }
}

export class FillFieldsStructInit extends FillStructInitBase {
    public override readonly id: string = "tolk.fill-struct-init"
    public override readonly name: string = "Fill all fields..."

    public constructor() {
        super(true)
    }
}

export class FillRequiredStructInit extends FillStructInitBase {
    public override readonly id: string = "tolk.fill-required-struct-init"
    public override readonly name: string = "Fill required fields..."

    public constructor() {
        super(false)
    }
}

function nodeAtPosition(pos: Position, file: TolkFile): SyntaxNode | null {
    const cursorPosition = asParserPoint(pos)
    return file.rootNode.descendantForPosition(cursorPosition)
}
