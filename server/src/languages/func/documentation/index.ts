import * as lsp from "vscode-languageserver"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {asLspRange} from "@server/utils/position"
import {NamedNode} from "@server/languages/func/psi/FuncNode"
import {Reference} from "@server/languages/func/psi/Reference"
import * as docs from "@server/languages/func/documentation/documentation"
import {FuncFile} from "@server/languages/func/psi/FuncFile"
import {ImportResolver} from "@server/languages/func/psi/ImportResolver"

export function provideFuncDocumentation(hoverNode: SyntaxNode, file: FuncFile): lsp.Hover | null {
    const hoverParent = hoverNode.parent

    if (hoverNode.type === "string_literal" && hoverParent?.type === "import_directive") {
        return documentationForImportPath(hoverNode, file)
    }

    if (hoverNode.type !== "identifier" && hoverNode.type !== "type_identifier") {
        return null
    }

    const res = Reference.resolve(NamedNode.create(hoverNode, file))
    if (res === null) return null

    const doc = docs.generateFuncDocFor(res, hoverNode)
    if (doc === null) return null

    return {
        range: asLspRange(hoverNode),
        contents: {
            kind: "markdown",
            value: doc,
        },
    }
}

function documentationForImportPath(hoverNode: SyntaxNode, file: FuncFile): lsp.Hover | null {
    const importNode = hoverNode.parent
    const importPath = importNode?.childForFieldName("path")
    if (!importPath) return null

    const resolvedPath = ImportResolver.resolveNode(file, importPath)
    if (resolvedPath === null) return null

    return {
        range: asLspRange(hoverNode),
        contents: {
            kind: "markdown",
            value: `\`\`\`func\n#include "${resolvedPath}"\n\`\`\``,
        },
    }
}
