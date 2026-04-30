//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type {WorkspaceEdit} from "vscode-languageserver"
import type {Position} from "vscode-languageclient"
import type {Node as SyntaxNode} from "web-tree-sitter"

import type {Intention, IntentionContext} from "@server/languages/tolk/intentions/Intention"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {Struct} from "@server/languages/tolk/psi/Decls"
import {parentOfType} from "@server/psi/utils"
import {asLspPosition, asParserPoint} from "@server/utils/position"
import {FileDiff} from "@server/utils/FileDiff"

export class GenerateStructOpcode implements Intention {
    public readonly id: string = "tolk.generate-32-bit-opcode"
    public readonly name: string = "Generate 32-bit opcode"

    public isAvailable(ctx: IntentionContext): boolean {
        return GenerateStructOpcode.findStruct(ctx) !== null
    }

    public invoke(ctx: IntentionContext): WorkspaceEdit | null {
        const structNode = GenerateStructOpcode.findStruct(ctx)
        if (!structNode) return null

        const struct = new Struct(structNode, ctx.file)
        const nameNode = struct.nameIdentifier()
        if (!nameNode) return null

        const prefix = GenerateStructOpcode.formatOpcode(struct.computeOpcode())

        const diff = FileDiff.forFile(ctx.file.uri)
        diff.appendTo(asLspPosition(nameNode.startPosition), `(${prefix}) `)

        return diff.toWorkspaceEdit()
    }

    private static findStruct(ctx: IntentionContext): SyntaxNode | null {
        const node = nodeAtPosition(ctx.position, ctx.file)
        if (!node) return null

        const structNode =
            node.type === "struct_declaration" ? node : parentOfType(node, "struct_declaration")
        if (!structNode) return null

        const struct = new Struct(structNode, ctx.file)
        if (struct.packPrefix() || !struct.nameIdentifier()) return null

        const fieldNode =
            node.type === "struct_field_declaration"
                ? node
                : parentOfType(node, "struct_field_declaration")
        if (fieldNode && parentOfType(fieldNode, "struct_declaration")?.equals(structNode)) {
            return null
        }

        return structNode
    }

    private static formatOpcode(opcode: number): string {
        return `0x${opcode.toString(16).padStart(8, "0")}`
    }
}

function nodeAtPosition(pos: Position, file: TolkFile): SyntaxNode | null {
    const cursorPosition = asParserPoint(pos)
    return file.rootNode.descendantForPosition(cursorPosition)
}
