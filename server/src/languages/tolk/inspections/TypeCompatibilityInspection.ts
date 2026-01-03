//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver"

import type {Node as SyntaxNode} from "web-tree-sitter"

import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {asLspRange} from "@server/utils/position"
import {RecursiveVisitor} from "@server/visitor/visitor"

import {typeOf, inferenceOf} from "@server/languages/tolk/type-inference"

import {Inspection, InspectionIds} from "./Inspection"

export class TypeCompatibilityInspection implements Inspection {
    public readonly id: "type-compatibility" = InspectionIds.TYPE_COMPATIBILITY

    public inspect(file: TolkFile): lsp.Diagnostic[] {
        if (file.fromStdlib || file.fromActon) return []
        const diagnostics: lsp.Diagnostic[] = []

        RecursiveVisitor.visit(file.rootNode, node => {
            switch (node.type) {
                case "object_literal": {
                    this.checkObjectLiteralTypes(node, file, diagnostics)
                    break
                }
                case "assignment": {
                    this.checkAssignmentTypes(node, file, diagnostics)
                    break
                }
                case "local_vars_declaration": {
                    this.checkLocalVarsDeclarationTypes(node, file, diagnostics)
                    break
                }
            }

            return true
        })

        return diagnostics
    }

    private checkObjectLiteralTypes(
        node: SyntaxNode,
        file: TolkFile,
        diagnostics: lsp.Diagnostic[],
    ): void {
        const args = node.childForFieldName("arguments")
        if (!args) return

        const inference = inferenceOf(node, file)
        if (!inference) return

        for (const child of args.children) {
            if (!child) continue
            if (child.type !== "instance_argument") continue

            const nameNode = child.childForFieldName("name")
            const valueNode = child.childForFieldName("value")

            if (!nameNode) continue

            // Check if a value is provided and has a type
            if (valueNode) {
                const valueType = typeOf(valueNode, file)
                const fieldType = typeOf(nameNode, file)

                if (valueType && fieldType) {
                    if (!fieldType.canRhsBeAssigned(valueType)) {
                        const expectedTypeName = fieldType.name()
                        const actualTypeName = valueType.name()

                        diagnostics.push({
                            severity: lsp.DiagnosticSeverity.Error,
                            range: asLspRange(valueNode),
                            message: `Type '${actualTypeName}' is not assignable to type '${expectedTypeName}'`,
                            source: "tolk",
                            code: "type-mismatch",
                        })
                    }
                }
            }
        }
    }

    private checkAssignmentTypes(
        node: SyntaxNode,
        file: TolkFile,
        diagnostics: lsp.Diagnostic[],
    ): void {
        const leftNode = node.childForFieldName("left")
        const rightNode = node.childForFieldName("right")

        if (!leftNode || !rightNode) return

        const leftType = typeOf(leftNode, file)
        const rightType = typeOf(rightNode, file)

        if (leftType && rightType) {
            if (!leftType.canRhsBeAssigned(rightType)) {
                const expectedTypeName = leftType.name()
                const actualTypeName = rightType.name()

                diagnostics.push({
                    severity: lsp.DiagnosticSeverity.Error,
                    range: asLspRange(rightNode),
                    message: `Type '${actualTypeName}' is not assignable to type '${expectedTypeName}'`,
                    source: "tolk",
                    code: "type-mismatch",
                })
            }
        }
    }

    private checkLocalVarsDeclarationTypes(
        node: SyntaxNode,
        file: TolkFile,
        diagnostics: lsp.Diagnostic[],
    ): void {
        const lhsNode = node.childForFieldName("lhs")
        const assignedValNode = node.childForFieldName("assigned_val")

        if (!lhsNode || !assignedValNode) return

        this.checkVarDeclarationLhs(lhsNode, assignedValNode, file, diagnostics)
    }

    private checkVarDeclarationLhs(
        lhsNode: SyntaxNode,
        assignedValNode: SyntaxNode,
        file: TolkFile,
        diagnostics: lsp.Diagnostic[],
    ): void {
        switch (lhsNode.type) {
            case "var_declaration": {
                const typeNode = lhsNode.childForFieldName("type")
                if (!typeNode) return

                const declaredType = typeOf(typeNode, file)
                const valueType = typeOf(assignedValNode, file)

                if (declaredType && valueType) {
                    if (!declaredType.canRhsBeAssigned(valueType)) {
                        const expectedTypeName = declaredType.name()
                        const actualTypeName = valueType.name()

                        diagnostics.push({
                            severity: lsp.DiagnosticSeverity.Error,
                            range: asLspRange(assignedValNode),
                            message: `Type '${actualTypeName}' is not assignable to type '${expectedTypeName}'`,
                            source: "tolk",
                            code: "type-mismatch",
                        })
                    }
                }
                break
            }
            case "tuple_vars_declaration":
            case "tensor_vars_declaration": {
                // For tuple/tensor declarations, check structural compatibility
                const lhsType = typeOf(lhsNode, file)
                const rhsType = typeOf(assignedValNode, file)

                if (lhsType && rhsType) {
                    if (!lhsType.canRhsBeAssigned(rhsType)) {
                        const expectedTypeName = lhsType.name()
                        const actualTypeName = rhsType.name()

                        diagnostics.push({
                            severity: lsp.DiagnosticSeverity.Error,
                            range: asLspRange(assignedValNode),
                            message: `Type '${actualTypeName}' is not assignable to type '${expectedTypeName}'`,
                            source: "tolk",
                            code: "type-mismatch",
                        })
                    }
                }

                // Also check individual variables within the tuple/tensor
                const varsNodes = lhsNode.childrenForFieldName("vars")
                for (const varNode of varsNodes) {
                    if (varNode && varNode.type === "var_declaration") {
                        // For individual vars in destructuring, we rely on type inference
                        // The actual compatibility is checked above
                        continue
                    }
                }
                break
            }
        }
    }
}
