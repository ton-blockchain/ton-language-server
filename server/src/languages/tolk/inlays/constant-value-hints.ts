//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"
import * as lsp from "vscode-languageserver"
import {Constant} from "../psi/Decls"
import {ConstantEvaluator} from "../evaluation/ConstantEvaluator"
import type {TolkFile} from "../psi/TolkFile"

export function constantValueHint(n: SyntaxNode, file: TolkFile, result: lsp.InlayHint[]): void {
    const constant = new Constant(n, file)
    const valueNode = constant.value()
    if (!valueNode) return

    if (ConstantEvaluator.isSimpleLiteral(valueNode.node)) return

    const evaluationResult = ConstantEvaluator.evaluateConstant(constant)

    if (evaluationResult.value === null || evaluationResult.type === "unknown") {
        return
    }

    const formattedValue = ConstantEvaluator.formatValue(evaluationResult)

    const position = {
        line: valueNode.node.endPosition.row,
        character: valueNode.node.endPosition.column,
    }

    const hintText = ` /* = ${formattedValue} */`

    result.push({
        label: hintText,
        position: position,
        tooltip: "Evaluated value: " + formattedValue,
        paddingLeft: false,
        paddingRight: false,
    })
}
