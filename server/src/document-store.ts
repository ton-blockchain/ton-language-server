//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as lsp from "vscode-languageserver"
import {TextDocuments} from "vscode-languageserver"
import {TextDocument} from "vscode-languageserver-textdocument"

export interface TextDocumentChange2 {
    readonly changes: {
        readonly range: lsp.Range
        readonly rangeOffset: number
        readonly rangeLength: number
        readonly text: string
    }[]
}

export class DocumentStore extends TextDocuments<TextDocument> {
    public constructor(_connection: lsp.Connection) {
        super({
            create: TextDocument.create,
            update: (doc, changes, version) => {
                const event: TextDocumentChange2 = {changes: []}

                for (const change of changes) {
                    if (!lsp.TextDocumentContentChangeEvent.isIncremental(change)) {
                        break
                    }
                    const rangeOffset = doc.offsetAt(change.range.start)
                    event.changes.push({
                        text: change.text,
                        range: change.range,
                        rangeOffset,
                        rangeLength:
                            // eslint-disable-next-line @typescript-eslint/no-deprecated
                            change.rangeLength ?? doc.offsetAt(change.range.end) - rangeOffset,
                    })
                }
                return TextDocument.update(doc, changes, version)
            },
        })

        super.listen(_connection)
    }
}

export function getOffsetFromPosition(fileContent: string, line: number, column: number): number {
    const lines = fileContent.split("\n")
    if (line < 0 || line > lines.length) {
        return 0
    }

    const targetLine = lines[line]
    if (column < 1 || column > targetLine.length + 1) {
        return 0
    }

    let offset = 0
    for (let i = 0; i < line; i++) {
        offset += lines[i].length + 1 // +1 for '\n'
    }
    offset += column - 1
    return offset
}
