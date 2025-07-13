import * as lsp from "vscode-languageserver"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {asLspRange} from "@server/utils/position"
import {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import {Reference} from "@server/languages/tolk/psi/Reference"
import * as docs from "@server/languages/tolk/documentation/documentation"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {generateExitCodeDocumentation} from "@server/languages/tolk/documentation/exit-code-documentation"
import {ImportResolver} from "@server/languages/tolk/psi/ImportResolver"
import {documentationForAnnotation} from "@server/languages/tolk/documentation/annotation-documentation"

export function provideTolkDocumentation(hoverNode: SyntaxNode, file: TolkFile): lsp.Hover | null {
    const hoverParent = hoverNode.parent
    // throw 10
    // assert (true) throw 10
    // assert(true, 10)
    if (
        hoverNode.type === "number_literal" &&
        (hoverParent?.type === "throw_statement" || hoverParent?.type === "assert_statement")
    ) {
        const excNo = hoverParent.childForFieldName("excNo")

        if (excNo && hoverParent.type === "assert_statement" && !hoverNode.equals(excNo)) {
            // assert (10) throw 20
            //         ^^ this
            return null
        }

        const doc = generateExitCodeDocumentation(Number.parseInt(hoverNode.text))
        if (doc === null) return null

        return {
            range: asLspRange(hoverNode),
            contents: {
                kind: "markdown",
                value: doc,
            },
        }
    }

    if (hoverNode.type === "string_literal" && hoverParent?.type === "import_directive") {
        return documentationForImportPath(hoverNode, file)
    }

    if (hoverParent?.type === "annotation") {
        return documentationForAnnotation(hoverNode)
    }

    if (hoverNode.type !== "identifier" && hoverNode.type !== "type_identifier") {
        return null
    }

    const res = Reference.resolve(NamedNode.create(hoverNode, file))
    if (res === null) return null

    const doc = docs.generateTolkDocFor(res, hoverNode)
    if (doc === null) return null

    return {
        range: asLspRange(hoverNode),
        contents: {
            kind: "markdown",
            value: doc,
        },
    }
}

function documentationForImportPath(hoverNode: SyntaxNode, file: TolkFile): lsp.Hover | null {
    const importNode = hoverNode.parent
    const importPath = importNode?.childForFieldName("path")
    if (!importPath) return null

    const resolvedPath = ImportResolver.resolveNode(file, importPath)
    if (resolvedPath === null) return null

    return {
        range: asLspRange(hoverNode),
        contents: {
            kind: "markdown",
            value: `\`\`\`tolk\nimport "${resolvedPath}"\n\`\`\``,
        },
    }
}
