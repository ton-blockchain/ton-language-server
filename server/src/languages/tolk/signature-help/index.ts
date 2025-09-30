import type {Node as SyntaxNode, Point} from "web-tree-sitter"

import * as lsp from "vscode-languageserver"

import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {CallLike, NamedNode, TolkNode} from "@server/languages/tolk/psi/TolkNode"
import {FunctionBase} from "@server/languages/tolk/psi/Decls"
import {parentOfType} from "@server/psi/utils"
import {Reference} from "@server/languages/tolk/psi/Reference"
import {File} from "@server/psi/File"
import {asParserPoint} from "@server/utils/position"
import {findTolkFile} from "@server/files"

export async function provideTolkSignatureInfo(
    params: lsp.SignatureHelpParams,
): Promise<lsp.SignatureHelp | null> {
    const file = await findTolkFile(params.textDocument.uri)

    const hoverNode = nodeAtPosition(params, file)
    if (!hoverNode) return null

    const res = findSignatureHelpTarget(hoverNode, file)
    if (!res) return null

    const {parametersInfo, rawArguments, presentation, isStructField, structFieldIndex} = res

    if (isStructField) {
        return {
            signatures: [
                {
                    label: presentation,
                    parameters: parametersInfo,
                    activeParameter: structFieldIndex,
                },
            ],
        }
    }

    // foo(1000, 2000, 3000)
    //    ^    ^     ^
    //    |    |     |______ argsCommas
    //    |    |____________|
    //    |_________________|
    //
    // To find the active parameter, we find the last comma before the cursor position.
    // We consider the opening bracket as a kind of comma for the zero element.
    // This algorithm supports both single-line and multi-line calls.

    const argsCommas = rawArguments.filter(value => value.text === "," || value.text === "(")

    let currentIndex = 0
    for (const [i, argComma] of argsCommas.entries()) {
        if (isPositionAfterOrEqual(params.position, argComma.endPosition)) {
            currentIndex = i
        } else {
            // found comma after cursor
            break
        }
    }

    return {
        signatures: [
            {
                label: presentation,
                parameters: parametersInfo,
                activeParameter: currentIndex,
            },
        ],
    }
}

interface SignatureHelpTarget {
    readonly rawArguments: readonly SyntaxNode[]
    readonly parametersInfo: lsp.ParameterInformation[]
    readonly presentation: string
    readonly isStructField: boolean
    readonly structFieldIndex: number
}

export function findSignatureHelpTarget(
    hoverNode: SyntaxNode,
    file: TolkFile,
): SignatureHelpTarget | null {
    const findParameters = (element: NamedNode): TolkNode[] => {
        if (element instanceof FunctionBase) {
            return element.parameters(true)
        }
        return []
    }

    const findSignatureHelpNode = (node: SyntaxNode): SyntaxNode | null => {
        const targetNodes = [
            "function_call",
            "object_literal",
            "instance_argument",
            "object_literal_body",
        ]
        const callNode = parentOfType(node, ...targetNodes)
        if (!callNode) return null

        // Foo { some: 10 }
        //     ^ this
        const isOpenBrace =
            callNode.type === "object_literal_body" && callNode.firstChild?.equals(node)

        // Foo { some: 10 }
        // ^^^ this
        const isInstanceName =
            callNode.type === "object_literal" && callNode.childForFieldName("type")?.equals(node)

        // Search for parent call for the following case
        // ```
        // foo(Fo<caret>o { value: 10 })
        // ```
        if (isInstanceName || isOpenBrace) {
            return findSignatureHelpNode(callNode)
        }

        if (
            callNode.type === "object_literal" ||
            callNode.type === "instance_argument" ||
            callNode.type === "object_literal_body"
        ) {
            return callNode
        }

        const call = new CallLike(callNode, file)

        // check if the current node within arguments
        //
        // foo() // <cursor>
        //   .bar()
        // > no
        //
        // foo(<caret>)
        //   .bar()
        // > yes
        const args = call.rawArguments()
        const openBrace = args.at(0)
        const closeBrace = args.at(-1)
        if (!openBrace || !closeBrace) return null

        const startIndex = openBrace.startIndex
        const endIndexIndex = closeBrace.endIndex

        if (node.startIndex < startIndex || node.endIndex > endIndexIndex) {
            const parent = node.parent
            if (!parent) return null
            return findSignatureHelpNode(parent)
        }

        return callNode
    }

    const callNode = findSignatureHelpNode(hoverNode)
    if (!callNode) return null

    if (callNode.type === "object_literal_body" || callNode.type === "instance_argument") {
        // TODO: support struct instance info once types are ready
        return null
    }

    const call = new CallLike(callNode, file)
    const calleeName = call.calleeName()
    if (!calleeName) return null

    const res = Reference.resolve(new NamedNode(calleeName, file))
    if (res === null) return null

    const parameters = findParameters(res)
    const parametersInfo: lsp.ParameterInformation[] = parameters.map(param => ({
        label: param.node.text,
    }))
    const parametersString = parametersInfo.map(el => el.label).join(", ")

    const rawArguments = call.rawArguments()

    if (!(res instanceof FunctionBase)) return null

    return {
        rawArguments,
        parametersInfo,
        presentation: `fun ${res.namePresentation()}(${parametersString})`,
        isStructField: false,
        structFieldIndex: 0,
    }
}

function nodeAtPosition(params: lsp.TextDocumentPositionParams, file: File): SyntaxNode | null {
    const cursorPosition = asParserPoint(params.position)
    return file.rootNode.descendantForPosition(cursorPosition)
}

function isPositionAfterOrEqual(position1: lsp.Position, position2: Point): boolean {
    if (position1.line > position2.row) {
        return true
    }
    if (position1.line === position2.row) {
        return position1.character >= position2.column
    }
    return false
}
