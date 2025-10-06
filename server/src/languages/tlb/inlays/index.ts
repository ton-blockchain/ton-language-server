//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core

import * as lsp from "vscode-languageserver-types"

import {RecursiveVisitor} from "@server/visitor/visitor"
import type {TlbFile} from "@server/languages/tlb/psi/TlbFile"

import {constructorHint} from "./constructor-hint"

export function collectTlbInlays(
    file: TlbFile,
    hints: {
        disable: boolean
        showConstructorTag: boolean
    },
): lsp.InlayHint[] | null {
    if (hints.disable || !hints.showConstructorTag) {
        return []
    }

    const result: lsp.InlayHint[] = []

    RecursiveVisitor.visit(file.rootNode, (n): boolean => {
        const type = n.type

        if (type === "constructor_") {
            constructorHint(n, file, result)
            return true
        }

        return true
    })

    if (result.length > 0) {
        return result
    }

    return null
}
