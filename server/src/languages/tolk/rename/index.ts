import * as lsp from "vscode-languageserver"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {DocumentUri, TextEdit, WorkspaceEdit} from "vscode-languageserver-types"
import {Referent} from "@server/languages/tolk/psi/Referent"
import {asLspRange, asParserPoint} from "@server/utils/position"
import {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import {Reference} from "@server/languages/tolk/psi/Reference"
import type {Node as SyntaxNode} from "web-tree-sitter"
import type {Position} from "vscode-languageclient"

export function provideTolkRename(params: lsp.RenameParams, file: TolkFile): WorkspaceEdit | null {
    const renameNode = findRenameTarget(params, file)
    if (!renameNode) return null

    const result = new Referent(renameNode, file).findReferences({
        includeDefinition: true,
        sameFileOnly: false,
        includeSelf: false,
    })
    if (result.length === 0) return null

    const changes: Record<DocumentUri, TextEdit[]> = {}
    const newName = wrapInBackticksIfNeeded(params.newName)

    for (const node of result) {
        const uri = node.file.uri
        const element = {
            range: asLspRange(node.node),
            newText: newName,
        }

        const isFieldRename = renameNode.parent?.type === "struct_field_declaration"
        const parent = node.node.parent

        // process renaming of a short instance field:
        // Foo { bar } -> Foo { bar: baz }
        if (parent?.type === "instance_argument") {
            const fieldName = parent.childForFieldName("name")?.text
            // when Foo { bar } and not Foo { bar: baz }
            const short = parent.childForFieldName("value") === null
            if (short) {
                element.newText = isFieldRename
                    ? `${params.newName}: ${fieldName}`
                    : `${fieldName}: ${params.newName}`
            }
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

export function provideTolkRenamePrepare(
    params: lsp.PrepareRenameParams,
    file: TolkFile,
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

function isValidIdentifier(name: string): boolean {
    return /^[A-Z_a-z]\w*$/.test(name)
}

function wrapInBackticksIfNeeded(name: string): string {
    if (isValidIdentifier(name) || (name.startsWith("`") && name.endsWith("`"))) {
        return name
    }
    return `\`${name}\``
}

const findRenameTarget = (
    params: lsp.TextDocumentPositionParams,
    file: TolkFile,
): SyntaxNode | null => {
    const node = nodeAtPosition(params.position, file)
    if (node?.type !== "identifier" && node?.type !== "type_identifier") {
        // Imagine case:
        //
        // foo: int;
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

function nodeAtPosition(pos: Position, file: TolkFile): SyntaxNode | null {
    const cursorPosition = asParserPoint(pos)
    return file.rootNode.descendantForPosition(cursorPosition)
}
