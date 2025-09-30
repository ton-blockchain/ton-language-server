//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type {WorkspaceEdit} from "vscode-languageserver"

import type {Position} from "vscode-languageclient"

import type {Node as SyntaxNode} from "web-tree-sitter"

import type {Intention, IntentionContext} from "@server/languages/tolk/intentions/Intention"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {asParserPoint} from "@server/utils/position"

import {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import {FileDiff} from "@server/utils/FileDiff"

import {index, IndexKey} from "@server/languages/tolk/indexes"

export class AddImport implements Intention {
    public readonly id: string = "tolk.add-import"
    public readonly name: string = "Import symbol from other file"

    private static resolveIdentifier(ctx: IntentionContext): NamedNode | undefined {
        const node = nodeAtPosition(ctx.position, ctx.file)
        if (node?.type !== "identifier" && node?.type !== "type_identifier") return undefined

        return AddImport.findDeclaration(node.text)
    }

    public isAvailable(ctx: IntentionContext): boolean {
        const resolved = AddImport.resolveIdentifier(ctx)
        if (!resolved) return false
        if (resolved.file.uri === ctx.file.uri) return false

        const importPath = resolved.file.importPath(ctx.file)
        return (
            !ctx.file.alreadyImport(importPath) &&
            !resolved.file.isImportedImplicitly() &&
            !index.hasSeveralDeclarations(resolved.name())
        )
    }

    public invoke(ctx: IntentionContext): WorkspaceEdit | null {
        const resolved = AddImport.resolveIdentifier(ctx)
        if (!resolved) return null

        const diff = FileDiff.forFile(ctx.file.uri)

        const positionToInsert = ctx.file.positionForNextImport()
        const importPath = resolved.file.importPath(ctx.file)

        const extraLine = positionToInsert.line === 0 && ctx.file.imports().length === 0 ? "\n" : ""

        diff.appendAsPrevLine(positionToInsert.line, `import "${importPath}"${extraLine}`)

        return diff.toWorkspaceEdit()
    }

    public static findDeclaration(name: string): NamedNode | undefined {
        return (
            index.elementByName(IndexKey.GlobalVariables, name) ??
            index.elementByName(IndexKey.TypeAlias, name) ??
            index.elementByName(IndexKey.Funcs, name) ??
            index.elementByName(IndexKey.Structs, name) ??
            index.elementByName(IndexKey.Enums, name) ??
            index.elementByName(IndexKey.Constants, name) ??
            undefined
        )
    }
}

function nodeAtPosition(pos: Position, file: TolkFile): SyntaxNode | null {
    const cursorPosition = asParserPoint(pos)
    return file.rootNode.descendantForPosition(cursorPosition)
}
