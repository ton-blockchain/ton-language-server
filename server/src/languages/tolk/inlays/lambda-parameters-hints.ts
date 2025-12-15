//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"
import {InlayHint, InlayHintKind} from "vscode-languageserver-types"

import {Lambda} from "@server/languages/tolk/psi/TolkNode"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {typeOf} from "@server/languages/tolk/type-inference"
import {UnknownTy} from "@server/languages/func/types/ty"

export function lambdaParametersHints(node: SyntaxNode, file: TolkFile, result: InlayHint[]): void {
    const lambda = new Lambda(node, file)
    const parameters = lambda.parameters()
    for (const parameter of parameters) {
        if (parameter.typeNode() !== null) continue
        const parameterType = typeOf(parameter.node, parameter.file)
        if (parameterType === null || parameterType instanceof UnknownTy) continue

        result.push({
            kind: InlayHintKind.Parameter,
            label: [
                {
                    value: ": ",
                },
                {
                    value: parameterType.name(),
                },
            ],
            position: {
                line: parameter.node.endPosition.row,
                character: parameter.node.endPosition.column,
            },
        })
    }
}
