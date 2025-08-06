//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as lsp from "vscode-languageserver"
import {RecursiveVisitor} from "@server/visitor/visitor"
import {asLspRange} from "@server/utils/position"
import {FiftFile} from "@server/languages/fift/psi/FiftFile"
import {trimPrefix} from "@server/utils/strings"

export function collectFiftCodeLenses(file: FiftFile): lsp.CodeLens[] {
    const result: lsp.CodeLens[] = []

    RecursiveVisitor.visit(file.rootNode, (n): boolean => {
        if (n.type === "definition") {
            const prevComment = n.previousSibling
            if (!prevComment || prevComment.type !== "comment") {
                return true
            }

            const text = trimPrefix(prevComment.text, "// ")
            const parts = text.split(/ /)
            const pathAndLine = parts[0]
            if (!pathAndLine) return true

            const [path, line] = pathAndLine.split(":")

            result.push({
                range: asLspRange(n),
                command: {
                    title: `Go to Tolk sources (${pathAndLine})`,
                    command: "ton.openFile",
                    arguments: [path, Number(line)],
                },
            })
        }

        return true
    })

    return result
}
