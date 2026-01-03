//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type * as lsp from "vscode-languageserver/node"

import {TolkNode} from "@server/languages/tolk/psi/TolkNode"
import {parentOfType} from "@server/psi/utils"

export class CompletionContext {
    public element: TolkNode
    public position: lsp.Position
    public triggerKind: lsp.CompletionTriggerKind

    public isType: boolean = false
    public isExpression: boolean = false
    public isStatement: boolean = false
    public topLevel: boolean = false
    public structTopLevel: boolean = false
    public afterDot: boolean = false
    public beforeParen: boolean = false
    public beforeSemicolon: boolean = false
    public insideImport: boolean = false
    public isAnnotationName: boolean = false
    public expectMatchArm: boolean = false
    public catchVariable: boolean = false
    public fieldInit: boolean = false
    public isFunctionName: boolean = false
    public isMethodName: boolean = false
    public expectFieldModifier: boolean = false
    public isEnumMemberName: boolean = false
    public insideString: boolean = false

    // struct fields
    public inNameOfFieldInit: boolean = false
    public inMultilineStructInit: boolean = false

    public constructor(
        content: string,
        element: TolkNode,
        position: lsp.Position,
        triggerKind: lsp.CompletionTriggerKind,
    ) {
        this.element = element
        this.position = position
        this.triggerKind = triggerKind

        const lines = content.split(/\n/g)
        const currentLine = lines[position.line]
        if (currentLine && currentLine[position.character - 1]) {
            const symbolAfter = currentLine[position.character - 1]
            this.afterDot = symbolAfter === "."
            const symbolAfterDummy = currentLine[position.character + "DummyIdentifier".length]
            this.beforeParen = symbolAfterDummy === "("
        }

        const symbolAfter = element.file.symbolAt(element.node.endIndex)
        this.beforeSemicolon = symbolAfter === ";"

        const parent = element.node.parent
        if (!parent) return

        if (parent.type === "annotation") {
            this.isAnnotationName = true
        }

        if (
            element.node.type === "identifier" &&
            element.node.parent?.type === "struct_field_declaration"
        ) {
            const prevSibling = element.node.previousNamedSibling
            if (
                prevSibling === null ||
                prevSibling.type === "struct_field_modifiers" ||
                prevSibling.text === "private" ||
                prevSibling.text === "readonly"
            ) {
                this.expectFieldModifier = true
            }
        }
        if (
            element.node.type === "identifier" &&
            element.node.parent?.type === "ERROR" &&
            element.node.parent.parent?.type === "struct_body"
        ) {
            // struct ResetCounter {
            //     queryId: uint64
            //     <caret>
            // }
            this.expectFieldModifier = true
        }

        if (parent.type === "catch_clause" && element.node.type === "identifier") {
            this.catchVariable = true
        }

        if (parent.type === "instance_argument") {
            const value = parent.childForFieldName("value")
            if (value?.equals(element.node)) {
                this.fieldInit = true
            }
        }

        if (
            parent.type === "function_declaration" &&
            parent.childForFieldName("name")?.equals(element.node)
        ) {
            this.isFunctionName = true
        }

        if (
            parent.type === "method_declaration" &&
            parent.childForFieldName("name")?.equals(element.node)
        ) {
            this.isMethodName = true
        }

        if (
            parent.type === "enum_member_declaration" &&
            parent.childForFieldName("name")?.equals(element.node)
        ) {
            this.isEnumMemberName = true
        }

        if (parent.type === "binary_operator" && parent.parent?.type === "match_arm") {
            // match (a) {
            //     <caret>
            //     Foo => {}.
            // }
            this.expectMatchArm = true
        }

        if (parent.type === "ERROR" && parent.parent?.type === "match_body") {
            this.expectMatchArm = true
        }

        if (
            parent.type === "ERROR" &&
            (parent.parent?.type === "source_file" ||
                parent.parent?.parent?.parent?.type === "source_file")
        ) {
            const grand = parent.parent
            if (grand.type === "struct_body") {
                this.structTopLevel = true
            } else {
                this.topLevel = true
            }
        }

        if (!this.topLevel && !this.structTopLevel) {
            if (parent.type === "expression_statement") {
                this.isStatement = true
            } else {
                this.isExpression = true
            }

            const valueNode = parent.childForFieldName("value")
            if (parent.type === "instance_argument") {
                // hack for completion
                if (valueNode === null || parent.text.includes("\n")) {
                    // Foo { name }
                    //       ^^^^
                    this.inNameOfFieldInit = true

                    const init = parentOfType(parent, "object_literal")
                    const args = init?.childForFieldName("arguments")
                    if (args) {
                        const openBracket = args.firstChild
                        const closeBracket = args.lastChild
                        if (!openBracket || !closeBracket) return

                        if (openBracket.startPosition.row != closeBracket.startPosition.row) {
                            this.inMultilineStructInit = true
                        }
                    }
                }
            }
        }

        if (element.node.type === "type_identifier") {
            this.isType = true
        }

        if (parent.type === "import_directive") {
            this.insideImport = true
        }

        if (element.node.type === "string_literal") {
            this.insideString = true
        }
    }

    public expression(): boolean {
        return (
            (this.isExpression || this.isStatement) &&
            !this.afterDot &&
            !this.isType &&
            !this.inNameOfFieldInit &&
            !this.insideImport &&
            !this.structTopLevel &&
            !this.expectMatchArm &&
            !this.catchVariable &&
            !this.isFunctionName &&
            !this.isMethodName &&
            !this.expectFieldModifier &&
            !this.isAnnotationName &&
            !this.insideString
        )
    }
}
