//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver-types"

import {RecursiveVisitor} from "@server/visitor/visitor"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {parametersHints} from "@server/languages/tolk/inlays/parameters-hints"
import {
    catchVariableTypeHint,
    constantDeclarationTypeHint,
    functionReturnTypeHint,
    variableDeclarationTypeHint,
} from "@server/languages/tolk/inlays/type-hints"
import {constantValueHint} from "@server/languages/tolk/inlays/constant-value-hints"
import {getMethodId} from "@server/languages/tolk/inlays/get-method-id"
import {FunctionBase} from "@server/languages/tolk/psi/Decls"
import {typeOf} from "@server/languages/tolk/type-inference"
import {lambdaParametersHints} from "@server/languages/tolk/inlays/lambda-parameters-hints"

type InlayHintProvider =
    | "parameters"
    | "lambda-parameters"
    | "variable-types"
    | "catch-types"
    | "constant-types"
    | "constant-values"
    | "method-ids"
    | "function-return-types"

class InlayHintProviderStats {
    public calls: number = 0
    public hints: number = 0
    public timeMs: number = 0
}

export function collectTolkInlays(
    file: TolkFile,
    hints: {
        disable: boolean
        parameters: boolean
        types: boolean
        showMethodId: boolean
        constantValues: boolean
    },
): lsp.InlayHint[] | null {
    if (hints.disable) return []

    const result: lsp.InlayHint[] = []
    const stats = createInlayHintProviderStats()
    const started = performance.now()
    let visitedNodes = 0

    const collect = (provider: InlayHintProvider, action: () => void): void => {
        const providerStats = stats[provider]
        const beforeHints = result.length
        const providerStarted = performance.now()

        action()

        providerStats.calls++
        providerStats.hints += result.length - beforeHints
        providerStats.timeMs += performance.now() - providerStarted
    }

    RecursiveVisitor.visit(file.rootNode, (n): boolean => {
        const type = n.type
        visitedNodes++

        if (type === "function_call" && hints.parameters) {
            collect("parameters", () => {
                parametersHints(n, file, result)
            })
            return true
        }

        if (type === "lambda_expression" && hints.parameters) {
            collect("lambda-parameters", () => {
                lambdaParametersHints(n, file, result)
            })
            return true
        }

        if (type === "var_declaration" && hints.types) {
            collect("variable-types", () => {
                variableDeclarationTypeHint(n, file, result)
            })
            return true
        }

        if (type === "catch_clause" && hints.types) {
            collect("catch-types", () => {
                const catchVar1 = n.childForFieldName("catch_var1")
                if (catchVar1) {
                    const type = typeOf(catchVar1, file)
                    catchVariableTypeHint(catchVar1, type, file, result)
                }
            })
            return true
        }

        if (type === "constant_declaration") {
            if (hints.types) {
                collect("constant-types", () => {
                    constantDeclarationTypeHint(n, file, result)
                })
            }
            if (hints.constantValues) {
                collect("constant-values", () => {
                    constantValueHint(n, file, result)
                })
            }
            return true
        }

        if (type === "get_method_declaration" && hints.showMethodId) {
            collect("method-ids", () => {
                getMethodId(n, file, result)
            })
        }

        if (
            type === "function_declaration" ||
            type === "method_declaration" ||
            type === "get_method_declaration"
        ) {
            collect("function-return-types", () => {
                const func = new FunctionBase(n, file)
                if (func.returnType() !== null) return // already has type hint
                functionReturnTypeHint(func, result)
            })
            return true
        }

        return true
    })

    logInlayHintBreakdown(file.uri, performance.now() - started, visitedNodes, result.length, stats)

    if (result.length > 0) {
        return result
    }

    return null
}

function createInlayHintProviderStats(): Record<InlayHintProvider, InlayHintProviderStats> {
    return {
        parameters: new InlayHintProviderStats(),
        "lambda-parameters": new InlayHintProviderStats(),
        "variable-types": new InlayHintProviderStats(),
        "catch-types": new InlayHintProviderStats(),
        "constant-types": new InlayHintProviderStats(),
        "constant-values": new InlayHintProviderStats(),
        "method-ids": new InlayHintProviderStats(),
        "function-return-types": new InlayHintProviderStats(),
    }
}

function logInlayHintBreakdown(
    uri: string,
    totalTimeMs: number,
    visitedNodes: number,
    hintCount: number,
    stats: Record<InlayHintProvider, InlayHintProviderStats>,
): void {
    if (totalTimeMs <= 0.3) return

    const parts = Object.entries(stats)
        .filter(([, stat]) => stat.calls > 0 || stat.timeMs > 0.3)
        .map(([provider, stat]) => {
            return `${provider}=${formatMs(stat.timeMs)}ms/${stat.calls} calls/${stat.hints} hints`
        })

    const details = parts.length > 0 ? `; ${parts.join("; ")}` : ""
    console.info(
        `tolk inlay hints breakdown ${uri}: total=${formatMs(totalTimeMs)}ms, visited=${visitedNodes}, hints=${hintCount}${details}`,
    )
}

function formatMs(value: number): string {
    return value.toFixed(3)
}
