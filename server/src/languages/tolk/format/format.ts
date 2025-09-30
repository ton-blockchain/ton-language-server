import {Range} from "vscode-languageserver-textdocument"
import * as lsp from "vscode-languageserver"

import {format} from "tolkfmt-test-dev/dist/src"

import {findTolkFile} from "@server/files"
import {createTolkParser} from "@server/parser"

export async function formatTolkFile(
    uri: string,
    range: Range | undefined,
    options: {
        readonly useFormatter: boolean
        readonly sortImports: boolean
    },
): Promise<lsp.TextEdit[] | null> {
    if (!options.useFormatter) return null

    const file = await findTolkFile(uri)

    const formatted = await format(file.content, {
        parser: createTolkParser(),
        range,
        sortImports: options.sortImports,
    })

    if (formatted === file.content) {
        // already formatted
        return null
    }

    const lines = file.content.split("\n")
    return [
        {
            range: {
                start: {
                    line: 0,
                    character: 0,
                },
                end: {
                    line: lines.length,
                    character: (lines.at(-1) ?? "").length,
                },
            },
            newText: formatted,
        },
    ]
}
