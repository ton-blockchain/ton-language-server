//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver"

import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {asLspPosition, asLspRange} from "@server/utils/position"
import {RecursiveVisitor} from "@server/visitor/visitor"

import {
    Enum,
    FunctionBase,
    Parameter,
    Struct,
    TypeAlias,
    TypeParameter,
} from "@server/languages/tolk/psi/Decls"
import {CallLike, NamedNode} from "@server/languages/tolk/psi/TolkNode"
import {Reference} from "@server/languages/tolk/psi/Reference"
import {NeverTy, TypeParameterTy, VoidTy} from "@server/languages/tolk/types/ty"
import {typeOf} from "@server/languages/tolk/type-inference"

import {Inspection, InspectionIds} from "./Inspection"

export class CallArgumentsCountMismatchInspection implements Inspection {
    public readonly id: "call-arguments-count-mismatch" =
        InspectionIds.CALL_ARGUMENTS_COUNT_MISMATCH

    public inspect(file: TolkFile): lsp.Diagnostic[] {
        if (file.fromStdlib || file.fromActon) return []
        const diagnostics: lsp.Diagnostic[] = []

        RecursiveVisitor.visit(file.rootNode, node => {
            if (node.type === "function_call") {
                const call = new CallLike(node, file)
                const calleeName = call.calleeName()
                if (calleeName === null) return true

                const element = new NamedNode(calleeName, file)
                const resolved = Reference.resolve(element)
                if (resolved === null) return true
                if (!(resolved instanceof FunctionBase)) return true
                this.checkCall(call, resolved, diagnostics)
            }

            return true
        })

        return diagnostics
    }

    private checkCall(call: CallLike, called: FunctionBase, diagnostics: lsp.Diagnostic[]): void {
        const deltaSelf = this.isInstanceMethodCall(call) ? 1 : 0
        const args = call.arguments()
        const argsCount = args.length + deltaSelf
        const parameters = called.parameters()
        const maxParams = parameters.length

        let minParams = maxParams
        while (minParams > 0 && this.canBeOmitted(parameters[minParams - 1])) {
            minParams--
        }

        if (argsCount > maxParams) {
            // foo(1, 2, 3)
            //        ^^^^ here
            const extraArgs = args.slice(maxParams)
            const startPosition = asLspPosition((extraArgs[0] ?? call.node).startPosition)
            const endPosition = asLspPosition((extraArgs.at(-1) ?? call.node).endPosition)

            diagnostics.push({
                severity: lsp.DiagnosticSeverity.Error,
                range: lsp.Range.create(startPosition, endPosition),
                message: `Too many arguments in call to '${called.name()}', expected ${maxParams - deltaSelf}, have ${argsCount - deltaSelf}`,
                source: "tolk",
                code: "arguments-count-mismatch",
            })
        }

        if (argsCount < minParams) {
            // foo()
            //     ^ here
            const anchor = call.rawArguments().at(-1) ?? call.node
            diagnostics.push({
                severity: lsp.DiagnosticSeverity.Error,
                range: asLspRange(anchor),
                message: `Too few arguments in call to '${called.name()}', expected ${maxParams - deltaSelf}, have ${argsCount - deltaSelf}`,
                source: "tolk",
                code: "arguments-count-mismatch",
            })
        }
    }

    private isInstanceMethodCall(call: CallLike): boolean {
        const qualifier = call.calleeQualifier()
        if (!qualifier) return false
        if (qualifier.type === "generic_instantiation") return false // Foo<int>.bar()
        if (qualifier.type !== "identifier") return true
        const resolvedQualifier = Reference.resolve(new NamedNode(qualifier, call.file))
        if (!resolvedQualifier) return false
        if (
            resolvedQualifier instanceof Struct ||
            resolvedQualifier instanceof Enum ||
            resolvedQualifier instanceof TypeAlias ||
            resolvedQualifier instanceof TypeParameter
        ) {
            // likely Foo.bar() static call
            return false
        }

        // instance method call like foo.bar()
        return true
    }

    private canBeOmitted(parameter: Parameter): boolean {
        if (parameter.defaultValue() !== null) {
            return true
        }

        const type = typeOf(parameter.node, parameter.file)?.baseType()
        if (
            type instanceof TypeParameterTy &&
            (type.defaultType instanceof NeverTy || type.defaultType instanceof VoidTy)
        ) {
            return true
        }

        return type instanceof NeverTy || type instanceof VoidTy
    }
}
