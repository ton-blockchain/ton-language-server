//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {Parser, Language} from "web-tree-sitter"

export let tolkLanguage: Language | null = null
export let fiftLanguage: Language | null = null
export let tlbLanguage: Language | null = null

export const initParser = async (
    treeSitterUri: string,
    tolkLangUri: string,
    fiftLangUri: string,
    tlbLangUri: string,
): Promise<void> => {
    if (tolkLanguage && fiftLanguage && tlbLanguage) {
        return
    }
    const options: object | undefined = {
        locateFile() {
            return treeSitterUri
        },
    }
    await Parser.init(options)
    tolkLanguage = await Language.load(tolkLangUri)
    fiftLanguage = await Language.load(fiftLangUri)
    tlbLanguage = await Language.load(tlbLangUri)
}

export function createTolkParser(): Parser {
    const parser = new Parser()
    parser.setLanguage(tolkLanguage)
    return parser
}

export function createFiftParser(): Parser {
    const parser = new Parser()
    parser.setLanguage(fiftLanguage)
    return parser
}

export function createTlbParser(): Parser {
    const parser = new Parser()
    parser.setLanguage(tlbLanguage)
    return parser
}
