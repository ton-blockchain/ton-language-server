import type {Node as SyntaxNode} from "web-tree-sitter"

import {Ty} from "@server/languages/tolk/types/ty"
import {TypeAtPositionParams, TypeAtPositionResponse} from "@shared/shared-msgtypes"
import {asLspRange, asParserPoint} from "@server/utils/position"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {typeOf} from "@server/languages/tolk/type-inference"

export function provideTolkTypeAtPosition(
    params: TypeAtPositionParams,
    file: TolkFile,
): TypeAtPositionResponse {
    const cursorPosition = asParserPoint(params.position)
    const node = file.rootNode.descendantForPosition(cursorPosition)
    if (!node) return {type: null, range: null}

    const adjustedNode = getAdjustedNodeForType(node)

    const res = findTypeForNode(adjustedNode, file)
    if (!res) {
        return {
            type: "void or unknown",
            range: asLspRange(node),
        }
    }

    const {ty, node: actualNode} = res

    return {
        type: ty.name(),
        range: asLspRange(actualNode),
    }
}

function getAdjustedNodeForType(node: SyntaxNode): SyntaxNode {
    // const parent = node.parent
    // if (parent?.type === "function_call" || parent?.type === "object_literal") {
    //     return parent
    // }

    return node
}

function findTypeForNode(node: SyntaxNode, file: TolkFile): {ty: Ty; node: SyntaxNode} | null {
    let nodeForType: SyntaxNode | null = node
    while (nodeForType) {
        const ty = typeOf(nodeForType, file)
        // const ty = TypeInferer.inferType(new Expression(nodeForType, file))
        if (ty) return {ty, node: nodeForType}
        nodeForType = nodeForType.parent
        if (nodeForType?.type.includes("statement")) break
    }

    return null
}
