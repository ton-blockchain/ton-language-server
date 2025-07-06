import * as lsp from "vscode-languageserver"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {TlbFile} from "@server/languages/tlb/psi/TlbFile"
import {asLspRange} from "@server/utils/position"
import {DeclarationNode, NamedNode} from "@server/languages/tlb/psi/TlbNode"
import {TlbReference} from "@server/languages/tlb/psi/TlbReference"
import {BUILTIN_TYPES} from "@server/languages/tlb/completion/providers/BuiltinTypesCompletionProvider"
import {generateDeclarationDoc} from "@server/languages/tlb/documentation/documentation"

export function provideTlbDocumentation(hoverNode: SyntaxNode, file: TlbFile): lsp.Hover | null {
    function generateKeywordDoc(node: SyntaxNode, doc: string): lsp.Hover | null {
        return {
            range: asLspRange(node),
            contents: {
                kind: "markdown",
                value: doc,
            },
        }
    }

    const text = hoverNode.text

    const builtinDoc = BUILTIN_TYPES.get(text)
    if (builtinDoc) {
        const parent = hoverNode.parent
        if (parent?.type === "constructor_tag") return null
        return generateKeywordDoc(hoverNode, builtinDoc)
    }

    if (hoverNode.type !== "identifier" && hoverNode.type !== "type_identifier") {
        return null
    }

    const results = TlbReference.multiResolve(new NamedNode(hoverNode, file))
    if (results.length === 0) {
        const typeDoc = generateTypeDoc(text)
        if (typeDoc) {
            return {
                range: asLspRange(hoverNode),
                contents: {
                    kind: "markdown",
                    value: typeDoc,
                },
            }
        }
        return null
    }

    if (results[0] instanceof DeclarationNode) {
        const declDoc = generateDeclarationDoc(results)
        return {
            range: asLspRange(hoverNode),
            contents: {
                kind: "markdown",
                value: declDoc,
            },
        }
    }

    return null
}

interface TypeDoc {
    readonly label: string
    readonly range: string
    readonly size: string
    readonly description?: string
}

function generateTypeDoc(word: string): string | undefined {
    const typeInfo = generateArbitraryIntDoc(word)
    if (!typeInfo) return undefined

    return `
**${word}** — ${typeInfo.label}

- **Range**: ${typeInfo.range}
- **Size**: ${typeInfo.size}
`
}

function generateArbitraryIntDoc(type: string): TypeDoc | undefined {
    const match = /^(u?int|bits)(\d+)$/.exec(type)
    if (!match) return undefined

    const [_, prefix, bits] = match
    const bitWidth = Number.parseInt(bits)

    if (prefix === "uint" && (bitWidth < 1 || bitWidth > 256)) return undefined
    if (prefix === "int" && (bitWidth < 1 || bitWidth > 257)) return undefined
    if (prefix === "bits" && (bitWidth < 1 || bitWidth > 257)) return undefined

    if (prefix === "bits") {
        return {
            label: `${bitWidth}-bit data`,
            range: `0 to ${bitWidth} bits`,
            size: `${bitWidth} bits`,
            description: "Arbitrary bit-width data",
        }
    }

    if (prefix === "uint") {
        return {
            label: `${bitWidth}-bit unsigned integer`,
            range: `0 to 2^${bitWidth} - 1`,
            size: `${bitWidth} bits`,
            description: "Arbitrary bit-width unsigned integer type",
        }
    }

    return {
        label: `${bitWidth}-bit signed integer`,
        range: `-2^${bitWidth - 1} to 2^${bitWidth - 1} - 1`,
        size: `${bitWidth} bits`,
        description: "Arbitrary bit-width signed integer type",
    }
}
