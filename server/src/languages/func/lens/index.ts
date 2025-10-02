//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {createHash} from "node:crypto"

import * as lsp from "vscode-languageserver"
import {RecursiveVisitor} from "@server/visitor/visitor"
import {FuncFile} from "@server/languages/func/psi/FuncFile"
import {crc32} from "@server/utils/crc32"
import {asLspRange} from "@server/utils/position"

export function collectFuncCodeLenses(file: FuncFile): lsp.CodeLens[] {
    if (file.fromStdlib) {
        // we don't need to count usages or show anything for stdlib symbols
        return []
    }

    const result: lsp.CodeLens[] = []

    RecursiveVisitor.visit(file.rootNode, (n): boolean => {
        // "..."c
        if (n.type === "number_string_literal") {
            const numberTag = n.text.at(-1) ?? ""
            const text = n.text.slice(1, -2)

            let res: string
            switch (numberTag) {
                case "H": {
                    res = createHash("sha256").update(text).digest("hex")
                    break
                }
                case "h": {
                    res = createHash("sha256").update(text).digest().subarray(0, 8).toString("hex")
                    break
                }
                case "u": {
                    res = Buffer.from(text).toString("hex")
                    break
                }
                case "c": {
                    res = crc32(text).toString(16)
                    break
                }
                default: {
                    res = text
                }
            }

            result.push({
                range: asLspRange(n),
                command: {
                    title: `Copy ${res} to clipboard`,
                    command: "ton.copyToClipboard",
                    arguments: [res],
                },
            })
        }

        return true
    })

    return result
}
