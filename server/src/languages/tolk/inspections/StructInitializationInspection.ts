//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {asLspRange} from "@server/utils/position"
import {RecursiveVisitor} from "@server/visitor/visitor"
import type {Node as SyntaxNode} from "web-tree-sitter"

import {Field} from "@server/languages/tolk/psi/Decls"
import {NeverTy, StructTy, TypeParameterTy} from "@server/languages/tolk/types/ty"
import {typeOf} from "@server/languages/tolk/type-inference"
import {trimBackticks} from "@server/languages/tolk/lang/names-util"

import {Inspection, InspectionIds} from "./Inspection"

export class StructInitializationInspection implements Inspection {
    public readonly id: "struct-initialization" = InspectionIds.STRUCT_INITIALIZATION

    public inspect(file: TolkFile): lsp.Diagnostic[] {
        if (file.fromStdlib) return []
        const diagnostics: lsp.Diagnostic[] = []

        RecursiveVisitor.visit(file.rootNode, node => {
            if (node.type === "object_literal") {
                this.checkStructLiteral(node, file, diagnostics)
            }

            return true
        })

        return diagnostics
    }

    private checkStructLiteral(
        node: SyntaxNode,
        file: TolkFile,
        diagnostics: lsp.Diagnostic[],
    ): void {
        const type = typeOf(node, file)?.baseType()
        if (!(type instanceof StructTy)) return

        const args = node.childForFieldName("arguments")
        if (!args) return

        const fields = type.fields()
        const requiredFields = fields.filter(f => !this.canBeOmitted(f)).map(f => f.name())

        const initializedFields: Set<string> = new Set()
        for (const child of args.children) {
            if (!child) continue
            if (child.type !== "instance_argument") continue
            const name = child.childForFieldName("name")
            if (!name) continue

            // Foo { name }
            //       ^^^^
            // or
            // Foo { name: value }
            //       ^^^^
            initializedFields.add(trimBackticks(name.text))
        }

        const missingFields = requiredFields.filter(field => !initializedFields.has(field))

        const message =
            missingFields.length === 1
                ? `Field '${missingFields[0]}' is required but not initialized`
                : `Fields ${missingFields.map(f => `'${f}'`).join(", ")} are required but not initialized`

        if (missingFields.length > 0) {
            const typeNode = node.childForFieldName("type") ?? args.child(0) ?? node // Foo or {

            diagnostics.push({
                severity: lsp.DiagnosticSeverity.Error,
                range: asLspRange(typeNode),
                message: message,
                source: "tolk",
                code: "missing-fields",
            })
        }
    }

    private canBeOmitted(f: Field): boolean {
        if (f.defaultValue() !== null) {
            return true
        }

        const nameNode = f.nameNode()?.node
        if (!nameNode) return false
        const type = typeOf(nameNode, f.file)?.baseType()
        if (type instanceof TypeParameterTy && type.defaultType instanceof NeverTy) {
            return true
        }

        return type instanceof NeverTy
    }
}
