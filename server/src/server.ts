//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {connection} from "./connection"
import {DocumentStore} from "./document-store"
import {initParser} from "./parser"
import {asParserPoint} from "@server/utils/position"
import {index as tolkIndex, IndexRoot as TolkIndexRoot} from "@server/languages/tolk/indexes"
import {index as funcIndex, IndexRoot as FuncIndexRoot} from "@server/languages/func/indexes"
import * as lsp from "vscode-languageserver"
import {DidChangeWatchedFilesParams, FileChangeType} from "vscode-languageserver"
import * as path from "node:path"
import {globalVFS} from "@server/vfs/global"
import {existsVFS} from "@server/vfs/files-adapter"
import type {ClientOptions} from "@shared/config-scheme"
import {
    DocumentationAtPositionRequest,
    SetToolchainVersionNotification,
    SetToolchainVersionParams,
    TypeAtPositionParams,
    TypeAtPositionRequest,
    TypeAtPositionResponse,
} from "@shared/shared-msgtypes"
import {Logger} from "@server/utils/logger"
import {clearDocumentSettings, getDocumentSettings, ServerSettings} from "@server/settings/settings"
import {provideFiftFoldingRanges} from "@server/languages/fift/foldings/collect"
import {provideFiftSemanticTokens as provideFiftSemanticTokens} from "server/src/languages/fift/semantic-tokens"
import {provideFiftInlayHints as collectFiftInlays} from "@server/languages/fift/inlays/collect"
import {WorkspaceEdit} from "vscode-languageserver-types"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {setToolchain, setWorkspaceRoot, toolchain} from "@server/toolchain"
import * as toolchainManager from "@server/toolchain-manager"
import {fileURLToPath} from "node:url"
import {
    FIFT_PARSED_FILES_CACHE,
    filePathToUri,
    findFiftFile,
    findFuncFile,
    findTlbFile,
    findTolkFile,
    FUNC_PARSED_FILES_CACHE,
    isFiftFile,
    isFuncFile,
    isTlbFile,
    isTolkFile,
    reparseFiftFile,
    reparseFuncFile,
    reparseTlbFile,
    reparseTolkFile,
    TLB_PARSED_FILES_CACHE,
    TOLK_PARSED_FILES_CACHE,
} from "@server/files"
import {provideFiftDocumentation} from "@server/languages/fift/documentation"
import {provideTlbDocumentation} from "@server/languages/tlb/documentation"
import {provideTlbDefinition} from "@server/languages/tlb/find-definitions"
import {provideFiftDefinition} from "@server/languages/fift/find-definitions"
import {File} from "@server/psi/File"
import {provideFiftReferences} from "@server/languages/fift/references"
import {provideTlbSemanticTokens} from "@server/languages/tlb/semantic-tokens"
import {provideTlbDocumentSymbols} from "@server/languages/tlb/symbols"
import {provideTlbCompletion} from "@server/languages/tlb/completion"
import {TLB_CACHE} from "@server/languages/tlb/cache"
import {provideTlbReferences} from "@server/languages/tlb/references"
import {TextDocument} from "vscode-languageserver-textdocument"
import {TolkIndexingRoot, TolkIndexingRootKind} from "@server/tolk-indexing-root"
import {TOLK_CACHE} from "@server/languages/tolk/cache"
import {provideTolkSemanticTokens} from "@server/languages/tolk/semantic-tokens"
import {
    provideTolkDefinition,
    provideTolkTypeDefinition,
} from "@server/languages/tolk/find-definitions"
import {provideTolkReferences} from "@server/languages/tolk/find-references"
import {
    provideExecuteTolkCommand,
    provideTolkCodeActions,
    TOLK_INTENTIONS,
} from "@server/languages/tolk/intentions"
import {provideTolkRename, provideTolkRenamePrepare} from "@server/languages/tolk/rename"
import {runTolkInspections} from "@server/languages/tolk/inspections"
import {provideTolkDocumentHighlight} from "@server/languages/tolk/highlighting"
import {provideTolkFoldingRanges} from "@server/languages/tolk/foldings"
import {
    provideTolkCompletion,
    provideTolkCompletionResolve,
} from "@server/languages/tolk/completion"
import {
    InvalidToolchainError,
    setProjectTolkStdlibPath,
    tolkStdlibSearchPaths,
} from "@server/languages/tolk/toolchain/toolchain"
import {
    provideTolkDocumentSymbols,
    provideTolkWorkspaceSymbols,
} from "@server/languages/tolk/symbols"
import {collectTolkInlays} from "@server/languages/tolk/inlays"
import {provideTolkSignatureInfo} from "@server/languages/tolk/signature-help"
import {provideTolkDocumentation} from "@server/languages/tolk/documentation"
import {provideTolkTypeAtPosition} from "@server/languages/tolk/custom/type-at-position"
import {onFileRenamed, processFileRenaming} from "@server/languages/tolk/rename/file-renaming"
import {FuncIndexingRoot, FuncIndexingRootKind} from "@server/func-indexing-root"
import {provideFuncDefinition} from "@server/languages/func/find-definitions"
import {provideFuncSemanticTokens} from "@server/languages/func/semantic-tokens"
import {provideFuncCompletion} from "@server/languages/func/completion"
import {provideFuncReferences} from "@server/languages/func/find-references"
import {provideFuncRename, provideFuncRenamePrepare} from "@server/languages/func/rename"
import {
    provideFuncDocumentSymbols,
    provideFuncWorkspaceSymbols,
} from "@server/languages/func/symbols"
import {provideFuncDocumentation} from "@server/languages/func/documentation"
import {collectFuncInlays} from "@server/languages/func/inlays"

/**
 * Whenever LS is initialized.
 *
 * @see initialize
 * @see initializeFallback
 */
let initialized = false
let initializationFinished = false

let pendingFileEvents: lsp.TextDocumentChangeEvent<TextDocument>[] = []
let clientInfo: {name?: string; version?: string} = {name: "", version: ""}

/**
 * Root folders for a project.
 * Used to find files to index.
 */
let workspaceFolders: lsp.WorkspaceFolder[] | null = null

/**
 * Tracks recently processed files from onDidChangeContent to avoid duplication with onDidChangeWatchedFiles
 * Contains URIs of files that should be skipped in onDidChangeWatchedFiles
 */
const recentlyProcessedFiles: Set<string> = new Set()

/**
 * Marks a file as recently processed to avoid duplication
 */
function markFileAsRecentlyProcessed(uri: string): void {
    recentlyProcessedFiles.add(uri)
}

/**
 * Checks if a file was recently processed and should be skipped
 * Removes the file from tracking after checking (one-time use)
 */
function checkIfRecentlyProcessedAndRemove(uri: string): boolean {
    const wasProcessed = recentlyProcessedFiles.has(uri)
    if (wasProcessed) {
        recentlyProcessedFiles.delete(uri)
    }
    return wasProcessed
}

async function processPendingEvents(): Promise<void> {
    console.info(`Processing ${pendingFileEvents.length} pending file events`)

    for (const event of pendingFileEvents) {
        await handleFileOpen(event, true)
    }

    pendingFileEvents = []
}

async function handleFileOpen(
    event: lsp.TextDocumentChangeEvent<TextDocument>,
    skipQueue: boolean,
): Promise<void> {
    const uri = event.document.uri

    if (!skipQueue && !initializationFinished) {
        pendingFileEvents.push(event)
        return
    }

    if (isTolkFile(uri, event)) {
        const file = await findTolkFile(uri)
        tolkIndex.addFile(uri, file)

        if (initializationFinished) {
            await runTolkInspections(uri, file, true)
        }
    }

    if (isFuncFile(uri, event)) {
        const file = await findFuncFile(uri)
        funcIndex.addFile(uri, file)
    }

    if (isFiftFile(uri, event)) {
        await findFiftFile(uri)
    }

    if (isTlbFile(uri, event)) {
        await findTlbFile(uri)
    }
}

const showErrorMessage = (msg: string): void => {
    void connection.sendNotification(lsp.ShowMessageNotification.type, {
        type: lsp.MessageType.Error,
        message: msg,
    })
}

async function findTolkStdlib(settings: ServerSettings, rootDir: string): Promise<string | null> {
    if (settings.tolk.stdlib.path !== null && settings.tolk.stdlib.path.length > 0) {
        return settings.tolk.stdlib.path
    }

    const searchDirs = [
        `${rootDir}/node_modules/@ton/tolk-js/dist/tolk-stdlib`,
        `${rootDir}/stdlib`,
        `${rootDir}/tolk-stdlib`,
        ...tolkStdlibSearchPaths(),
    ]

    const testStdlibOath = process.env["TEST_TOLK_STDLIB_PATH"]
    if (testStdlibOath) {
        searchDirs.unshift(testStdlibOath)
    }

    async function findDirectory(): Promise<string | null> {
        for (const searchDir of searchDirs) {
            if (await existsVFS(globalVFS, filePathToUri(searchDir))) {
                return searchDir
            }
        }

        return null
    }

    const stdlibPath = await findDirectory()

    if (stdlibPath === null) {
        console.error(
            "Tolk standard library not found! Searched in:\n",
            searchDirs.map(dir => path.join(rootDir, dir)).join("\n"),
        )

        showErrorMessage(
            "Tolk standard library is missing! Try installing dependencies with `yarn/npm install` or specify `tolk.stdlib.path` in settings",
        )
        return null
    }

    console.info(`Using Tolk Standard library from ${stdlibPath}`)
    return stdlibPath
}

function findStubs(): string | null {
    return path.join(__dirname, "stubs")
}

async function initialize(): Promise<void> {
    if (!workspaceFolders || workspaceFolders.length === 0 || initialized) {
        // use fallback later, see `initializeFallback`
        return
    }
    initialized = true

    const reporter = await connection.window.createWorkDoneProgress()

    reporter.begin("TON Language Server", 0)

    const rootUri = workspaceFolders[0].uri
    const rootDir = fileURLToPath(rootUri)

    setWorkspaceRoot(rootDir)

    const settings = await getDocumentSettings(rootUri)

    try {
        toolchainManager.setWorkspaceRoot(rootDir)
        await toolchainManager.setToolchains(
            settings.tolk.toolchain.toolchains,
            settings.tolk.toolchain.activeToolchain,
        )

        const activeToolchain = toolchainManager.getActiveToolchain()
        if (activeToolchain) {
            setToolchain(activeToolchain)
            console.info(
                `using toolchain ${toolchain.toString()} (${toolchainManager.getActiveToolchainId()})`,
            )

            await connection.sendNotification(SetToolchainVersionNotification, {
                version: toolchain.version,
                toolchain: toolchain.getToolchainInfo(),
                environment: toolchain.getEnvironmentInfo(),
            } satisfies SetToolchainVersionParams)
        } else {
            console.warn(`No active toolchain found for ${settings.tolk.toolchain.activeToolchain}`)
        }
    } catch (error) {
        if (error instanceof InvalidToolchainError) {
            console.info(`toolchain is invalid ${error.message}`)
            showErrorMessage(error.message)
        }
    }

    const stdlibPath = await findTolkStdlib(settings, rootDir)
    if (stdlibPath !== null) {
        reporter.report(50, "Indexing: (1/3) Standard Library")
        const stdlibUri = filePathToUri(stdlibPath)
        tolkIndex.withStdlibRoot(new TolkIndexRoot("stdlib", stdlibUri))

        const stdlibRoot = new TolkIndexingRoot(stdlibUri, TolkIndexingRootKind.Stdlib)
        await stdlibRoot.index()
    }

    setProjectTolkStdlibPath(stdlibPath)

    reporter.report(55, "Indexing: (2/3) Stubs")
    const stubsPath = findStubs()
    if (stubsPath !== null) {
        const stubsUri = filePathToUri(stubsPath)
        tolkIndex.withStubsRoot(new TolkIndexRoot("stubs", stubsUri))
        funcIndex.withStubsRoot(new FuncIndexRoot("stubs", stubsUri))

        console.info(`Using Tolk Stubs from ${stubsPath}`)

        const stubsRoot = new TolkIndexingRoot(stubsUri, TolkIndexingRootKind.Stdlib)
        await stubsRoot.index()

        const funcStubsRoot = new FuncIndexingRoot(stubsUri, FuncIndexingRootKind.Stdlib)
        await funcStubsRoot.index()
    }

    reporter.report(90, "Indexing: (3/3) Workspace")
    tolkIndex.withRoots([new TolkIndexRoot("workspace", rootUri)])
    const tolkWorkspaceRoot = new TolkIndexingRoot(rootUri, TolkIndexingRootKind.Workspace)
    await tolkWorkspaceRoot.index()

    funcIndex.withRoots([new FuncIndexRoot("workspace", rootUri)])
    const funcWorkspaceRoot = new FuncIndexingRoot(rootUri, FuncIndexingRootKind.Workspace)
    await funcWorkspaceRoot.index()

    reporter.report(100, "Ready")

    // When we are ready, just reload all applied highlighting and hints and clear cache
    // This way we support fast local resolving and then full resolving after indexing.

    // Only run this in VS Code, as other editors may not handle these requests (like Helix)
    if (clientInfo.name?.includes("Code") || clientInfo.name?.includes("Codium")) {
        await connection.sendRequest(lsp.SemanticTokensRefreshRequest.type)
        await connection.sendRequest(lsp.InlayHintRefreshRequest.type)
    }
    TOLK_CACHE.clear()
    TLB_CACHE.clear()

    reporter.done()
    initializationFinished = true

    await processPendingEvents()
}

// eslint-disable-next-line @typescript-eslint/no-misused-promises
connection.onInitialized(async () => {
    await initialize()
})

async function findConfigFileDir(startPath: string, fileName: string): Promise<string | null> {
    let currentPath = startPath

    // search only at depths up to 20
    for (let i = 0; i < 20; i++) {
        const potentialPath = path.join(currentPath, fileName)
        const potentialUri = filePathToUri(potentialPath)
        const exists = await existsVFS(globalVFS, potentialUri)
        if (exists) return currentPath

        const parentPath = path.dirname(currentPath)
        if (parentPath === currentPath) break

        currentPath = parentPath
    }

    return null
}

// For some reason, some editors (like Neovim) don't pass workspace folders to initialization.
// So we need to find root first and then call `initialize`.
async function initializeFallback(uri: string): Promise<void> {
    // let's try to initialize with this way
    const filepath = fileURLToPath(uri)
    const projectDir = await findConfigFileDir(path.dirname(filepath), "package.json")
    if (projectDir === null) {
        console.info(`project directory not found, using file directory`)
        const dir = path.dirname(filepath)
        workspaceFolders = [
            {
                uri: filePathToUri(dir),
                name: path.basename(dir),
            },
        ]
        await initialize()
        return
    }

    console.info(`found project directory: ${projectDir}`)
    workspaceFolders = [
        {
            uri: filePathToUri(projectDir),
            name: path.basename(projectDir),
        },
    ]
    await initialize()
}

connection.onInitialize(async (initParams: lsp.InitializeParams): Promise<lsp.InitializeResult> => {
    console.info("Started new session")
    console.info("Running in", initParams.clientInfo?.name)
    console.info("workspaceFolders:", initParams.workspaceFolders)

    if (initParams.clientInfo) {
        clientInfo = initParams.clientInfo
    }

    workspaceFolders = initParams.workspaceFolders ?? []
    const opts = initParams.initializationOptions as ClientOptions | undefined
    const treeSitterUri = opts?.treeSitterWasmUri ?? `${__dirname}/tree-sitter.wasm`
    const tolkLangUri = opts?.tolkLangWasmUri ?? `${__dirname}/tree-sitter-tolk.wasm`
    const funcLangUri = opts?.funcLangWasmUri ?? `${__dirname}/tree-sitter-func.wasm`
    const fiftLangUri = opts?.fiftLangWasmUri ?? `${__dirname}/tree-sitter-fift.wasm`
    const tlbLangUri = opts?.tlbLangWasmUri ?? `${__dirname}/tree-sitter-tlb.wasm`
    await initParser(treeSitterUri, tolkLangUri, funcLangUri, fiftLangUri, tlbLangUri)

    const documents = new DocumentStore(connection)

    documents.onDidOpen(async event => {
        const uri = event.document.uri
        console.info("open:", uri)

        if (!initialized) {
            await initializeFallback(uri)
        }

        await handleFileOpen(event, false)
    })

    documents.onDidChangeContent(async event => {
        if (event.document.version === 1) {
            return
        }

        const uri = event.document.uri
        console.info("changed:", uri)

        markFileAsRecentlyProcessed(uri)

        if (isFiftFile(uri, event)) {
            FIFT_PARSED_FILES_CACHE.delete(uri)
            reparseFiftFile(uri, event.document.getText())
        }

        if (isTlbFile(uri, event)) {
            TLB_PARSED_FILES_CACHE.delete(uri)
            TLB_CACHE.clear()
            reparseTlbFile(uri, event.document.getText())
        }

        if (isTolkFile(uri, event)) {
            tolkIndex.fileChanged(uri)
            const file = reparseTolkFile(uri, event.document.getText())
            tolkIndex.addFile(uri, file, false)

            if (initializationFinished) {
                await runTolkInspections(uri, file, false) // linters require saved files, see onDidSave
            }
        }

        if (isFuncFile(uri, event)) {
            funcIndex.fileChanged(uri)
            const file = reparseFuncFile(uri, event.document.getText())
            funcIndex.addFile(uri, file, false)
        }
    })

    documents.onDidSave(async event => {
        const uri = event.document.uri
        if (isTolkFile(uri, event)) {
            if (initializationFinished) {
                const file = await findTolkFile(uri)
                await runTolkInspections(uri, file, true)
            }
        }
    })

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    connection.onDidChangeWatchedFiles(async (params: DidChangeWatchedFilesParams) => {
        for (const change of params.changes) {
            const uri = change.uri

            if (change.type === FileChangeType.Changed && checkIfRecentlyProcessedAndRemove(uri)) {
                console.info(`Skipping recently processed file: ${uri}`)
                continue
            }

            if (isTolkFile(uri)) {
                if (change.type === FileChangeType.Created) {
                    console.info(`Find external create of ${uri}`)
                    const file = await findTolkFile(uri)
                    tolkIndex.addFile(uri, file)
                    continue
                }

                if (!TOLK_PARSED_FILES_CACHE.has(uri)) {
                    // we don't care about non-parsed files
                    continue
                }

                if (change.type === FileChangeType.Changed) {
                    console.info(`Find external change of ${uri}`)
                    tolkIndex.fileChanged(uri)
                    const file = await findTolkFile(uri, true)
                    tolkIndex.addFile(uri, file, false)
                }

                if (change.type === FileChangeType.Deleted) {
                    console.info(`Find external delete of ${uri}`)
                    tolkIndex.removeFile(uri)
                }
            }

            if (isFuncFile(uri)) {
                if (change.type === FileChangeType.Created) {
                    console.info(`Find external create of ${uri}`)
                    const file = await findFuncFile(uri)
                    funcIndex.addFile(uri, file)
                    continue
                }

                if (!FUNC_PARSED_FILES_CACHE.has(uri)) {
                    // we don't care about non-parsed files
                    continue
                }

                if (change.type === FileChangeType.Changed) {
                    console.info(`Find external change of ${uri}`)
                    funcIndex.fileChanged(uri)
                    const file = await findFuncFile(uri, true)
                    funcIndex.addFile(uri, file, false)
                }

                if (change.type === FileChangeType.Deleted) {
                    console.info(`Find external delete of ${uri}`)
                    funcIndex.removeFile(uri)
                }
            }
        }
    })

    connection.onRequest("workspace/willRenameFiles", processFileRenaming)
    connection.onNotification("workspace/didRenameFiles", onFileRenamed)

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    connection.onDidChangeConfiguration(async () => {
        clearDocumentSettings()

        if (workspaceFolders && workspaceFolders.length > 0) {
            const rootUri = workspaceFolders[0].uri
            const newSettings = await getDocumentSettings(rootUri)

            if (
                newSettings.tolk.toolchain.activeToolchain !==
                toolchainManager.getActiveToolchainId()
            ) {
                try {
                    await toolchainManager.setToolchains(
                        newSettings.tolk.toolchain.toolchains,
                        newSettings.tolk.toolchain.activeToolchain,
                    )

                    const activeToolchain = toolchainManager.getActiveToolchain()
                    if (activeToolchain) {
                        setToolchain(activeToolchain)
                        console.info(
                            `switched to toolchain ${toolchain.toString()} (${toolchainManager.getActiveToolchainId()})`,
                        )

                        await connection.sendNotification(SetToolchainVersionNotification, {
                            version: toolchain.version,
                            toolchain: toolchain.getToolchainInfo(),
                            environment: toolchain.getEnvironmentInfo(),
                        } satisfies SetToolchainVersionParams)
                    }
                } catch (error) {
                    if (error instanceof InvalidToolchainError) {
                        console.error(`Failed to switch toolchain: ${error.message}`)
                        showErrorMessage(`Failed to switch toolchain: ${error.message}`)
                    }
                }
            }
        }

        void connection.sendRequest(lsp.InlayHintRefreshRequest.type)
        void connection.sendRequest(lsp.CodeLensRefreshRequest.type)
    })

    function nodeAtPosition(params: lsp.TextDocumentPositionParams, file: File): SyntaxNode | null {
        const cursorPosition = asParserPoint(params.position)
        return file.rootNode.descendantForPosition(cursorPosition)
    }

    async function provideDocumentation(params: lsp.HoverParams): Promise<lsp.Hover | null> {
        const uri = params.textDocument.uri

        if (isFiftFile(uri)) {
            const file = await findFiftFile(uri)
            const hoverNode = nodeAtPosition(params, file)
            if (!hoverNode) return null
            return provideFiftDocumentation(hoverNode, file)
        }

        if (isTlbFile(uri)) {
            const file = await findTlbFile(uri)
            const hoverNode = nodeAtPosition(params, file)
            if (!hoverNode) return null
            return provideTlbDocumentation(hoverNode, file)
        }

        if (isTolkFile(uri)) {
            const file = await findTolkFile(params.textDocument.uri)
            const hoverNode = nodeAtPosition(params, file)
            if (!hoverNode) return null
            return provideTolkDocumentation(hoverNode, file)
        }

        if (isFuncFile(uri)) {
            const file = await findFuncFile(params.textDocument.uri)
            const hoverNode = nodeAtPosition(params, file)
            if (!hoverNode) return null
            return provideFuncDocumentation(hoverNode, file)
        }

        return null
    }

    connection.onRequest(lsp.HoverRequest.type, provideDocumentation)

    connection.onRequest(
        lsp.DefinitionRequest.type,
        async (params: lsp.DefinitionParams): Promise<lsp.Location[] | lsp.LocationLink[]> => {
            const uri = params.textDocument.uri

            if (isFiftFile(uri)) {
                const file = await findFiftFile(uri)
                const node = nodeAtPosition(params, file)
                if (!node || node.type !== "identifier") return []

                return provideFiftDefinition(node, file)
            }

            if (isTlbFile(uri)) {
                const file = await findTlbFile(uri)
                const hoverNode = nodeAtPosition(params, file)
                if (!hoverNode) return []

                return provideTlbDefinition(hoverNode, file)
            }

            if (isTolkFile(uri)) {
                const file = await findTolkFile(uri)
                const hoverNode = nodeAtPosition(params, file)
                if (!hoverNode) return []

                return provideTolkDefinition(hoverNode, file)
            }

            if (isFuncFile(uri)) {
                const file = await findFuncFile(uri)
                const hoverNode = nodeAtPosition(params, file)
                if (!hoverNode) return []

                return provideFuncDefinition(hoverNode, file)
            }

            return []
        },
    )

    connection.onRequest(
        lsp.TypeDefinitionRequest.type,
        async (
            params: lsp.TypeDefinitionParams,
        ): Promise<lsp.Definition | lsp.DefinitionLink[]> => {
            const uri = params.textDocument.uri

            if (isTolkFile(uri)) {
                const file = await findTolkFile(uri)
                const hoverNode = nodeAtPosition(params, file)
                if (!hoverNode) return []

                return provideTolkTypeDefinition(hoverNode, file)
            }

            return []
        },
    )

    connection.onRequest(lsp.CompletionResolveRequest.type, provideTolkCompletionResolve)
    connection.onRequest(
        lsp.CompletionRequest.type,
        async (params: lsp.CompletionParams): Promise<lsp.CompletionItem[]> => {
            const uri = params.textDocument.uri

            if (isTolkFile(uri)) {
                const file = await findTolkFile(uri)
                return provideTolkCompletion(file, params, uri)
            }

            if (isFuncFile(uri)) {
                const file = await findFuncFile(uri)
                return provideFuncCompletion(file, params, uri)
            }

            if (isTlbFile(uri)) {
                const file = await findTlbFile(uri)
                return provideTlbCompletion(file, params, uri)
            }

            return []
        },
    )

    connection.onRequest(
        lsp.InlayHintRequest.type,
        async (params: lsp.InlayHintParams): Promise<lsp.InlayHint[] | null> => {
            const uri = params.textDocument.uri
            const settings = await getDocumentSettings(uri)
            if (settings.tolk.hints.disable || !initializationFinished) {
                return null
            }

            if (isFiftFile(uri)) {
                const file = await findFiftFile(uri)
                return collectFiftInlays(file, "{gas}", settings.fift.hints)
            }

            if (isTolkFile(uri)) {
                const file = await findTolkFile(uri)
                return collectTolkInlays(file, settings.tolk.hints)
            }

            if (isFuncFile(uri)) {
                const file = await findFuncFile(uri)
                return collectFuncInlays(file, settings.func.hints)
            }

            return null
        },
    )

    connection.onRequest(
        lsp.RenameRequest.type,
        async (params: lsp.RenameParams): Promise<WorkspaceEdit | null> => {
            const uri = params.textDocument.uri

            if (isTolkFile(uri)) {
                const file = await findTolkFile(uri)
                return provideTolkRename(params, file)
            }

            if (isFuncFile(uri)) {
                const file = await findFuncFile(uri)
                return provideFuncRename(params, file)
            }

            return null
        },
    )

    connection.onRequest(
        lsp.PrepareRenameRequest.type,
        async (params: lsp.PrepareRenameParams): Promise<lsp.PrepareRenameResult | null> => {
            const uri = params.textDocument.uri

            if (isTolkFile(uri)) {
                const file = await findTolkFile(uri)

                const result = provideTolkRenamePrepare(params, file)
                if (typeof result === "string") {
                    showErrorMessage(result)
                    return null
                }

                return result
            }

            if (isFuncFile(uri)) {
                const file = await findFuncFile(uri)

                const result = provideFuncRenamePrepare(params, file)
                if (typeof result === "string") {
                    showErrorMessage(result)
                    return null
                }

                return result
            }

            return null
        },
    )

    connection.onRequest(
        lsp.DocumentHighlightRequest.type,
        async (params: lsp.DocumentHighlightParams): Promise<lsp.DocumentHighlight[] | null> => {
            const uri = params.textDocument.uri

            if (isTolkFile(uri)) {
                const file = await findTolkFile(uri)
                const node = nodeAtPosition(params, file)
                if (!node) return null
                return provideTolkDocumentHighlight(node, file)
            }

            return null
        },
    )

    connection.onRequest(
        lsp.ReferencesRequest.type,
        async (params: lsp.ReferenceParams): Promise<lsp.Location[] | null> => {
            const uri = params.textDocument.uri

            if (isFiftFile(uri)) {
                const file = await findFiftFile(uri)
                const node = nodeAtPosition(params, file)
                if (!node) return null
                return provideFiftReferences(node, file)
            }

            if (isTlbFile(uri)) {
                const file = await findTlbFile(uri)
                const node = nodeAtPosition(params, file)
                if (!node) return null
                return provideTlbReferences(node, file)
            }

            if (isTolkFile(uri)) {
                const file = await findTolkFile(uri)
                const node = nodeAtPosition(params, file)
                if (!node) return null
                const startTime = performance.now()
                const result = provideTolkReferences(node, file)
                const endTime = performance.now()
                const time = endTime - startTime
                console.info(`find references: ${time}ms`)
                return result
            }

            if (isFuncFile(uri)) {
                const file = await findFuncFile(uri)
                const node = nodeAtPosition(params, file)
                if (!node) return null
                return provideFuncReferences(node, file)
            }

            return null
        },
    )

    connection.onRequest(
        lsp.SignatureHelpRequest.type,
        async (params: lsp.SignatureHelpParams): Promise<lsp.SignatureHelp | null> => {
            const uri = params.textDocument.uri

            if (isTolkFile(uri)) {
                return provideTolkSignatureInfo(params)
            }

            return null
        },
    )

    connection.onRequest(
        lsp.FoldingRangeRequest.type,
        async (params: lsp.FoldingRangeParams): Promise<lsp.FoldingRange[] | null> => {
            const uri = params.textDocument.uri

            if (isFiftFile(uri)) {
                const file = await findFiftFile(uri)
                return provideFiftFoldingRanges(file)
            }

            if (isTolkFile(uri)) {
                const file = await findTolkFile(uri)
                return provideTolkFoldingRanges(file)
            }

            return null
        },
    )

    connection.onRequest(
        lsp.SemanticTokensRequest.type,
        async (params: lsp.SemanticTokensParams): Promise<lsp.SemanticTokens | null> => {
            const uri = params.textDocument.uri
            const settings = await getDocumentSettings(uri)

            if (isTolkFile(uri)) {
                const file = await findTolkFile(uri)
                return provideTolkSemanticTokens(file)
            }

            if (isFuncFile(uri)) {
                const file = await findFuncFile(uri)
                return provideFuncSemanticTokens(file)
            }

            if (isFiftFile(uri)) {
                const file = await findFiftFile(uri)
                return provideFiftSemanticTokens(file, settings.fift.semanticHighlighting)
            }

            if (isTlbFile(uri)) {
                const file = await findTlbFile(uri)
                return provideTlbSemanticTokens(file)
            }

            return null
        },
    )

    connection.onRequest(
        lsp.ExecuteCommandRequest.type,
        async (params: lsp.ExecuteCommandParams): Promise<string | null> => {
            const tolkCommand = await provideExecuteTolkCommand(params)
            if (tolkCommand) return tolkCommand
            return null
        },
    )

    connection.onRequest(
        lsp.CodeActionRequest.type,
        async (params: lsp.CodeActionParams): Promise<lsp.CodeAction[] | null> => {
            const uri = params.textDocument.uri

            if (isTolkFile(uri)) {
                const file = await findTolkFile(uri)
                return provideTolkCodeActions(file, params)
            }

            return null
        },
    )

    connection.onRequest(
        lsp.DocumentSymbolRequest.type,
        async (params: lsp.DocumentSymbolParams): Promise<lsp.DocumentSymbol[]> => {
            const uri = params.textDocument.uri

            if (isTolkFile(uri)) {
                const file = await findTolkFile(uri)
                return provideTolkDocumentSymbols(file)
            }

            if (isFuncFile(uri)) {
                const file = await findFuncFile(uri)
                return provideFuncDocumentSymbols(file)
            }

            if (isTlbFile(uri)) {
                const file = await findTlbFile(uri)
                return provideTlbDocumentSymbols(file)
            }

            return []
        },
    )

    connection.onRequest(lsp.WorkspaceSymbolRequest.type, (): lsp.WorkspaceSymbol[] => {
        return [...provideTolkWorkspaceSymbols(), ...provideFuncWorkspaceSymbols()]
    })

    // Custom LSP requests

    connection.onRequest(
        TypeAtPositionRequest,
        async (params: TypeAtPositionParams): Promise<TypeAtPositionResponse> => {
            const uri = params.textDocument.uri

            if (isTolkFile(uri)) {
                const file = await findTolkFile(uri)
                return provideTolkTypeAtPosition(params, file)
            }

            return {type: null, range: null}
        },
    )

    connection.onRequest(DocumentationAtPositionRequest, provideDocumentation)

    console.info("TON language server is ready!")

    return {
        capabilities: {
            textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
            documentFormattingProvider: true,
            documentSymbolProvider: true,
            workspaceSymbolProvider: true,
            definitionProvider: true,
            typeDefinitionProvider: true,
            renameProvider: {
                prepareProvider: true,
            },
            hoverProvider: true,
            inlayHintProvider: true,
            referencesProvider: true,
            documentHighlightProvider: true,
            foldingRangeProvider: true,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: [".", "@", "#"], // @ for annotations, # for imports/pragmas
            },
            signatureHelpProvider: {
                triggerCharacters: ["(", ","],
                retriggerCharacters: [",", " "],
            },
            semanticTokensProvider: {
                legend: {
                    tokenTypes: Object.keys(lsp.SemanticTokenTypes),
                    tokenModifiers: Object.keys(lsp.SemanticTokenModifiers),
                },
                range: false,
                full: true,
            },
            codeActionProvider: {
                codeActionKinds: [lsp.CodeActionKind.QuickFix],
            },
            executeCommandProvider: {
                commands: [
                    "tolk.executeGetScopeProvider",
                    "tolk.getUnresolvedIdentifiers",
                    ...TOLK_INTENTIONS.map(it => it.id),
                ],
            },
            workspace: {
                workspaceFolders: {
                    supported: true,
                    changeNotifications: true,
                },
                fileOperations: {
                    willRename: {
                        filters: [
                            {
                                scheme: "file",
                                pattern: {
                                    glob: "**/*.tolk",
                                },
                            },
                        ],
                    },
                    didRename: {
                        filters: [
                            {
                                scheme: "file",
                                pattern: {
                                    glob: "**/*.tolk",
                                },
                            },
                        ],
                    },
                },
            },
        },
    }
})

Logger.initialize(connection, `${__dirname}/ton-language-server.log`)

connection.listen()
