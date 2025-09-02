//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {asLspPosition, asLspRange} from "@server/utils/position"
import {RecursiveVisitor} from "@server/visitor/visitor"
import {Inspection, InspectionIds} from "./Inspection"
import {inferenceOf, methodCandidates} from "@server/languages/tolk/type-inference"
import {CallLike} from "@server/languages/tolk/psi/TolkNode"
import {Ty, UnknownTy, UnionTy} from "@server/languages/tolk/types/ty"
import {Node as SyntaxNode} from "web-tree-sitter"
import {FileDiff} from "@server/utils/FileDiff"

export class NeedNotNullUnwrappingInspection implements Inspection {
    public readonly id: "need-not-null-unwrapping" = InspectionIds.NEED_NOT_NULL_UNWRAPPING

    public inspect(file: TolkFile): lsp.Diagnostic[] {
        if (file.fromStdlib) return []
        const diagnostics: lsp.Diagnostic[] = []

        RecursiveVisitor.visit(file.rootNode, node => {
            if (node.type !== "function_call") return true
            const call = new CallLike(node, file)
            const calleeName = call.calleeName()
            if (!calleeName) return true

            const inference = inferenceOf(node, file)
            if (!inference) return true

            const resolved = inference.resolve(calleeName)
            if (resolved) return true // already resolved, all okay

            const qualifier = call.calleeQualifier()
            if (!qualifier) return true // simple call like `foo()`

            const qualifierType = inference.typeOf(qualifier)
            if (!qualifierType) return true

            if (qualifierType instanceof UnionTy && qualifierType.asNullable()) {
                // try to find methods for unwrapped T?
                const asNullable =
                    qualifierType.asNullable() ??
                    ([UnknownTy.UNKNOWN as Ty, UnknownTy.UNKNOWN as Ty] as const)
                const innerTy = asNullable[0]

                const methods = methodCandidates(inference.ctx, innerTy, calleeName.text)
                if (methods.length === 0) return true // no options for this type

                diagnostics.push({
                    severity: lsp.DiagnosticSeverity.Error,
                    range: asLspRange(calleeName),
                    message: `Cannot call method \`${calleeName.text}\` on nullable type \`${qualifierType.name()}\`, you need to unwrap it with \`!\` or explicitly check for \`${qualifier.text} != null\``,
                    source: "tolk",
                    data: this.unwrapWithNotNull(file, qualifier),
                })
            }

            return true
        })

        return diagnostics
    }

    private unwrapWithNotNull(file: TolkFile, qualifier: SyntaxNode): undefined | lsp.CodeAction {
        const diff = FileDiff.forFile(file.uri)

        diff.appendTo(asLspPosition(qualifier.endPosition), "!")

        const edit = diff.toWorkspaceEdit()
        return {
            edit,
            title: `Unwrap with \`!\` (unsafe)`,
            isPreferred: true,
        }
    }
}
