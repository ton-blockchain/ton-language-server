import * as lsp from "vscode-languageserver"
import {TextDocument} from "vscode-languageserver-textdocument"
import {pathToFileURL} from "node:url"
import {createFiftParser, createFuncParser, createTlbParser, createTolkParser} from "@server/parser"
import {readFileVFS, globalVFS} from "@server/vfs/files-adapter"
import {FiftFile} from "@server/languages/fift/psi/FiftFile"
import {TlbFile} from "@server/languages/tlb/psi/TlbFile"
import {URI} from "vscode-uri"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {measureTime} from "@server/psi/utils"
import {FuncFile} from "@server/languages/func/psi/FuncFile"

export const TOLK_PARSED_FILES_CACHE: Map<string, TolkFile> = new Map()
export const FUNC_PARSED_FILES_CACHE: Map<string, FuncFile> = new Map()
export const FIFT_PARSED_FILES_CACHE: Map<string, FiftFile> = new Map()
export const TLB_PARSED_FILES_CACHE: Map<string, TlbFile> = new Map()

export async function findTolkFile(uri: string, changed: boolean = false): Promise<TolkFile> {
    const cached = TOLK_PARSED_FILES_CACHE.get(uri)
    if (cached !== undefined && !changed) {
        return cached
    }

    const rawContent = await readOrUndefined(uri)
    if (rawContent === undefined) {
        console.error(`cannot read ${uri} file`)
    }

    const content = rawContent ?? ""
    return measureTime(`reparse ${uri}`, () => reparseTolkFile(uri, content))
}

export function reparseTolkFile(uri: string, content: string): TolkFile {
    const parser = createTolkParser()
    const tree = parser.parse(content)
    if (!tree) {
        throw new Error(`FATAL ERROR: cannot parse ${uri} file`)
    }

    // TODO: why we have %40 here?
    const file = new TolkFile(uri.replace("%40", "@"), tree, content)
    TOLK_PARSED_FILES_CACHE.set(uri, file)
    return file
}

export async function findFuncFile(uri: string, changed: boolean = false): Promise<FuncFile> {
    const cached = FUNC_PARSED_FILES_CACHE.get(uri)
    if (cached !== undefined && !changed) {
        return cached
    }

    const rawContent = await readOrUndefined(uri)
    if (rawContent === undefined) {
        console.error(`cannot read ${uri} file`)
    }

    const content = rawContent ?? ""
    return measureTime(`reparse ${uri}`, () => reparseFuncFile(uri, content))
}

export function reparseFuncFile(uri: string, content: string): FuncFile {
    const parser = createFuncParser()
    const tree = parser.parse(content)
    if (!tree) {
        throw new Error(`FATAL ERROR: cannot parse ${uri} file`)
    }

    // TODO: why we have %40 here?
    const file = new FuncFile(uri.replace("%40", "@"), tree, content)
    FUNC_PARSED_FILES_CACHE.set(uri, file)
    return file
}

export async function findFiftFile(uri: string): Promise<FiftFile> {
    const cached = FIFT_PARSED_FILES_CACHE.get(uri)
    if (cached !== undefined) {
        return cached
    }

    const rawContent = await readOrUndefined(uri)
    if (rawContent === undefined) {
        console.error(`cannot read ${uri} file`)
    }

    const content = rawContent ?? ""
    return reparseFiftFile(uri, content)
}

export function reparseFiftFile(uri: string, content: string): FiftFile {
    const parser = createFiftParser()
    const tree = parser.parse(content)
    if (!tree) {
        throw new Error(`FATAL ERROR: cannot parse ${uri} file`)
    }

    const file = new FiftFile(uri, tree, content)
    FIFT_PARSED_FILES_CACHE.set(uri, file)
    return file
}

export async function findTlbFile(uri: string): Promise<TlbFile> {
    const cached = TLB_PARSED_FILES_CACHE.get(uri)
    if (cached) {
        return cached
    }

    const rawContent = await readOrUndefined(uri)
    if (rawContent === undefined) {
        console.error(`cannot read ${uri} file`)
    }

    const content = rawContent ?? ""
    return reparseTlbFile(uri, content)
}

export function reparseTlbFile(uri: string, content: string): TlbFile {
    const parser = createTlbParser()
    const tree = parser.parse(content)
    if (!tree) {
        throw new Error(`FATAL ERROR: cannot parse ${uri} file`)
    }

    const file = new TlbFile(uri, tree, content)
    TLB_PARSED_FILES_CACHE.set(uri, file)
    return file
}

async function readOrUndefined(uri: string): Promise<string | undefined> {
    return readFileVFS(globalVFS, uri)
}

export function uriToFilePath(uri: string): string {
    return fileURLToPath(uri)
}

export const isTolkFile = (
    uri: string,
    event?: lsp.TextDocumentChangeEvent<TextDocument>,
): boolean => event?.document.languageId === "tolk" || uri.endsWith(".tolk")

export const isFuncFile = (
    uri: string,
    event?: lsp.TextDocumentChangeEvent<TextDocument>,
): boolean => event?.document.languageId === "func" || uri.endsWith(".fc") || uri.endsWith(".func")

export const isFiftFile = (
    uri: string,
    event?: lsp.TextDocumentChangeEvent<TextDocument>,
): boolean => event?.document.languageId === "fift" || uri.endsWith(".fif")

export const isTlbFile = (
    uri: string,
    event?: lsp.TextDocumentChangeEvent<TextDocument>,
): boolean => event?.document.languageId === "tlb" || uri.endsWith(".tlb")

// export function filePathToUri(filePath: string): string {
//     return pathToFileURL(filePath).href
// }
export const filePathToUri = (filePath: string): string => {
    const url = pathToFileURL(filePath).toString()
    return url.replace(/c:/g, "c%3A").replace(/d:/g, "d%3A")
}

function fileURLToPath(uri: string): string {
    const normalizedUri = uri.replace(/\\/g, "/")
    return URI.parse(normalizedUri).fsPath
}
