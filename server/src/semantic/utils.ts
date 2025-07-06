//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
export interface SemanticToken {
    readonly line: number
    readonly start: number
    readonly len: number
    readonly typ: number
    readonly mods: string[]
}

/**
 * Encode encodes an array of semantic tokens into an array of u32s.
 *
 * See https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_semanticTokens
 * for more information.
 */
export function encode(tokens: SemanticToken[]): number[] {
    const result = [...tokens]

    // By specification, the tokens must be sorted.
    result.sort((left, right) => {
        if (left.line !== right.line) {
            return left.line - right.line
        }
        return left.start - right.start
    })

    const res: number[] = [result.length * 5, 0]
    let last: SemanticToken = {line: 0, start: 0, len: 0, typ: 0, mods: []}

    let cur = 0
    for (const tok of result) {
        const typ = tok.typ >>> 0
        res[cur] = cur === 0 ? tok.line : tok.line - last.line
        res[cur + 1] = tok.start
        if (cur > 0 && res[cur] === 0) {
            res[cur + 1] = tok.start - last.start
        }
        res[cur + 2] = tok.len
        res[cur + 3] = typ
        res[cur + 4] = 0
        cur += 5
        last = tok
    }

    return res.slice(0, cur)
}
