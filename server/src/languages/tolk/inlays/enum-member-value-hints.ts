//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"
import * as lsp from "vscode-languageserver-types"

import {ConstantEvaluator} from "@server/languages/tolk/evaluation/ConstantEvaluator"
import {Enum} from "@server/languages/tolk/psi/Decls"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"

export function enumMemberValueHints(n: SyntaxNode, file: TolkFile, result: lsp.InlayHint[]): void {
    const enumDecl = new Enum(n, file)
    const evaluator = new ConstantEvaluator()
    const values = evaluator.evaluateEnumValues(enumDecl)

    for (const member of enumDecl.members()) {
        const value = values.get(member.node.id)
        if (value?.type !== "int" || typeof value.value !== "bigint") {
            continue
        }

        const valueText = value.value.toString()
        const explicitValue = member.defaultValue()

        if (explicitValue !== null && explicitValue.node.text === valueText) {
            continue
        }

        const anchor = explicitValue?.node ?? member.nameIdentifier()
        if (!anchor) continue

        result.push({
            kind: lsp.InlayHintKind.Parameter,
            label: ` = ${valueText}`,
            position: {
                line: anchor.endPosition.row,
                character: anchor.endPosition.column,
            },
            tooltip: `Enum value: ${valueText}`,
        })
    }
}
