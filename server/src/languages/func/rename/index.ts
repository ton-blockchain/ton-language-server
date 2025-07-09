import * as lsp from "vscode-languageserver"
import {FuncFile} from "@server/languages/func/psi/FuncFile"
import {DocumentUri, TextEdit, WorkspaceEdit} from "vscode-languageserver-types"
import {Referent} from "@server/languages/func/psi/Referent"
import {asLspRange, asParserPoint} from "@server/utils/position"
import {NamedNode} from "@server/languages/func/psi/FuncNode"
import {Reference} from "@server/languages/func/psi/Reference"
import type {Node as SyntaxNode} from "web-tree-sitter"
import type {Position} from "vscode-languageclient"

export function provideFuncRename(params: lsp.RenameParams, file: FuncFile): WorkspaceEdit | null {
    const renameNode = findRenameTarget(params, file)
    if (!renameNode) return null

    const result = new Referent(renameNode, file).findReferences({
        includeDefinition: true,
        sameFileOnly: false,
        includeSelf: false,
    })
    if (result.length === 0) return null

    const changes: Record<DocumentUri, TextEdit[]> = {}
    const newName = params.newName

    for (const node of result) {
        const uri = node.file.uri
        const element = {
            range: asLspRange(node.node),
            newText: newName,
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (changes[uri]) {
            changes[uri].push(element)
        } else {
            changes[uri] = [element]
        }
    }

    return {changes}
}

export function provideFuncRenamePrepare(
    params: lsp.PrepareRenameParams,
    file: FuncFile,
): lsp.PrepareRenameResult | string | null {
    const renameNode = findRenameTarget(params, file)
    if (!renameNode) return null
    if (renameNode.type !== "identifier" && renameNode.type !== "type_identifier") {
        return null
    }

    const element = NamedNode.create(renameNode, file)
    const res = Reference.resolve(element)
    if (res === null) return null

    if (res.file.fromStdlib || res.file.fromStubs) {
        return `Can not rename element from Standard Library`
    }

    return {
        range: asLspRange(renameNode),
        defaultBehavior: true,
        placeholder: renameNode.text,
    }
}

const findRenameTarget = (
    params: lsp.TextDocumentPositionParams,
    file: FuncFile,
): SyntaxNode | null => {
    const node = nodeAtPosition(params.position, file)
    if (node?.type !== "identifier" && node?.type !== "type_identifier") {
        // Imagine case:
        //
        // foo = 10;
        // ^^^ selection
        //
        // position will be point to `:`, not to the last ` o `, so we need to
        // move the cursor to the right to find the identifier.
        const prevNode = nodeAtPosition(
            {
                line: params.position.line,
                character: params.position.character - 1,
            },
            file,
        )

        if (prevNode?.type !== "identifier" && prevNode?.type !== "type_identifier") {
            return null
        }

        return prevNode
    }
    return node
}

function nodeAtPosition(pos: Position, file: FuncFile): SyntaxNode | null {
    const cursorPosition = asParserPoint(pos)
    return file.rootNode.descendantForPosition(cursorPosition)
}
