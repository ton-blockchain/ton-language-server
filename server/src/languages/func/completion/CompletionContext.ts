//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type * as lsp from "vscode-languageserver/node"

import {FuncNode} from "@server/languages/func/psi/FuncNode"

export class CompletionContext {
    public element: FuncNode
    public position: lsp.Position
    public triggerKind: lsp.CompletionTriggerKind

    public isType: boolean = false
    public isExpression: boolean = false
    public isStatement: boolean = false
    public topLevel: boolean = false
    public afterDot: boolean = false
    public afterTilda: boolean = false
    public beforeParen: boolean = false
    public beforeSemicolon: boolean = false
    public insideImport: boolean = false

    public constructor(
        content: string,
        element: FuncNode,
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
            this.afterTilda = symbolAfter === "~"
            const symbolAfterDummy = currentLine[position.character + "DummyIdentifier".length]
            this.beforeParen = symbolAfterDummy === "("
        }

        const symbolAfter = element.file.symbolAt(element.node.endIndex)
        this.beforeSemicolon = symbolAfter === ";"

        const parent = element.node.parent
        if (!parent) return

        if (
            parent.type === "ERROR" &&
            (parent.parent?.type === "source_file" ||
                parent.parent?.parent?.parent?.type === "source_file")
        ) {
            this.topLevel = true
        }

        if (
            parent.type === "type_identifier" &&
            parent.parent?.type === "ERROR" &&
            parent.parent.parent?.type === "source_file"
        ) {
            this.topLevel = true
        }

        if (!this.topLevel) {
            if (parent.type === "expression_statement") {
                this.isStatement = true
            } else {
                this.isExpression = true
            }
        }

        if (element.node.type === "type_identifier") {
            this.isType = true
        }

        if (parent.type === "import_directive") {
            this.insideImport = true
        }
    }

    public expression(): boolean {
        return (
            (this.isExpression || this.isStatement) &&
            !this.afterDot &&
            !this.isType &&
            !this.insideImport
        )
    }
}
