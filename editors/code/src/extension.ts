//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import * as path from "node:path"
import {Utils as vscode_uri} from "vscode-uri"
import {
    LanguageClient,
    LanguageClientOptions,
    RevealOutputChannelOn,
    ServerOptions,
    TransportKind,
} from "vscode-languageclient/node"
import {consoleError, createClientLog} from "./client-log"
import {getClientConfiguration} from "./client-config"
import {
    DocumentationAtPositionRequest,
    TypeAtPositionParams,
    TypeAtPositionRequest,
    TypeAtPositionResponse,
    SetToolchainVersionNotification,
    SetToolchainVersionParams,
} from "@shared/shared-msgtypes"
import type {ClientOptions} from "@shared/config-scheme"
import {registerBuildTasks} from "./build-system"
import {registerOpenBocCommand} from "./commands/openBocCommand"
import {BocEditorProvider} from "./providers/BocEditorProvider"
import {BocFileSystemProvider} from "./providers/BocFileSystemProvider"
import {BocDecompilerProvider} from "./providers/BocDecompilerProvider"
import {registerSaveBocDecompiledCommand} from "./commands/saveBocDecompiledCommand"
import {Range, Position, FileSystemWatcher} from "vscode"
import {ToolchainConfig} from "@server/settings/settings"
import {configureDebugging} from "./debugging"

let client: LanguageClient | null = null
let cachedToolchainInfo: SetToolchainVersionParams | null = null

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    await checkConflictingExtensions()

    startServer(context).catch(consoleError)
    await registerBuildTasks(context)
    registerOpenBocCommand(context)
    registerSaveBocDecompiledCommand(context)
    configureDebugging(context)

    const config = vscode.workspace.getConfiguration("ton")
    const openDecompiled = config.get<boolean>("boc.openDecompiledOnOpen")
    if (openDecompiled) {
        BocEditorProvider.register()

        const bocFsProvider = new BocFileSystemProvider()
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider("boc", bocFsProvider, {
                isCaseSensitive: true,
                isReadonly: false,
            }),
        )
    }

    const bocDecompilerProvider = new BocDecompilerProvider()
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
            BocDecompilerProvider.scheme,
            bocDecompilerProvider,
        ),
    )

    const bocWatcher = registerBocWatcher(bocDecompilerProvider)
    context.subscriptions.push(bocWatcher)
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined
    }
    return client.stop()
}

async function startServer(context: vscode.ExtensionContext): Promise<vscode.Disposable> {
    const disposables: vscode.Disposable[] = []

    const clientOptions: LanguageClientOptions = {
        outputChannel: createClientLog(),
        revealOutputChannelOn: RevealOutputChannelOn.Never,
        documentSelector: [
            {scheme: "file", language: "tolk"},
            {scheme: "file", language: "func"},
            {scheme: "file", language: "fift"},
            {scheme: "file", language: "tlb"},
            {scheme: "untitled", language: "tolk"},
        ],
        synchronize: {
            configurationSection: "ton",
            fileEvents: vscode.workspace.createFileSystemWatcher("**/*.{tolk,fc,func,tlb}"),
        },
        initializationOptions: {
            clientConfig: getClientConfiguration(),
            treeSitterWasmUri: vscode_uri.joinPath(context.extensionUri, "./dist/tree-sitter.wasm")
                .fsPath,
            tolkLangWasmUri: vscode_uri.joinPath(
                context.extensionUri,
                "./dist/tree-sitter-tolk.wasm",
            ).fsPath,
            funcLangWasmUri: vscode_uri.joinPath(
                context.extensionUri,
                "./dist/tree-sitter-func.wasm",
            ).fsPath,
            fiftLangWasmUri: vscode_uri.joinPath(
                context.extensionUri,
                "./dist/tree-sitter-fift.wasm",
            ).fsPath,
            tlbLangWasmUri: vscode_uri.joinPath(context.extensionUri, "./dist/tree-sitter-tlb.wasm")
                .fsPath,
        } as ClientOptions,
    }

    const serverModule = context.asAbsolutePath(path.join("dist", "server.js"))

    const serverOptions: ServerOptions = {
        run: {
            module: serverModule,
            transport: TransportKind.ipc,
        },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: {execArgv: ["--nolazy", "--inspect=6009"]}, // same port as in .vscode/launch.json
        },
    }
    client = new LanguageClient("ton-server", "TON Language Server", serverOptions, clientOptions)

    await client.start()

    registerCommands(disposables)

    const langStatusBar = vscode.window.createStatusBarItem(
        "Tolk",
        vscode.StatusBarAlignment.Left,
        60,
    )

    langStatusBar.text = "Tolk"

    client.onNotification(SetToolchainVersionNotification, (params: SetToolchainVersionParams) => {
        cachedToolchainInfo = params

        const settings = vscode.workspace.getConfiguration("ton")
        const hash =
            settings.get<boolean>("tolk.toolchain.showShortCommitInStatusBar") &&
            params.version.commit.length > 8
                ? ` (${params.version.commit.slice(-8)})`
                : ""

        const activeToolchainId = settings.get<string>("tolk.toolchain.activeToolchain", "auto")
        const toolchains = settings.get<Record<string, ToolchainConfig | undefined>>(
            "tolk.toolchain.toolchains",
            {},
        )
        const activeToolchainName = toolchains[activeToolchainId]?.name ?? "Unknown"

        langStatusBar.text = `Tolk ${params.version.number}${hash}`

        const tooltipLines = [
            `**Tolk Toolchain Information**`,
            ``,
            `**Version:** ${params.version.number}`,
            ``,
            `**Commit:** ${params.version.commit || "Unknown"}`,
            ``,
            `**Active Toolchain:** ${activeToolchainName} (${activeToolchainId})`,
            ``,
            `**Toolchain:**`,
            `- Path: \`${params.toolchain.path}\``,
            `- Auto-detected: ${params.toolchain.isAutoDetected ? "Yes" : "No"}`,
            ...(params.toolchain.detectionMethod
                ? [`- Detection method: ${params.toolchain.detectionMethod}`]
                : []),
            ``,
            `**Environment:**`,
            `- Platform: ${params.environment.platform}`,
            `- Architecture: ${params.environment.arch}`,
            ...(params.environment.nodeVersion
                ? [`- Node.js: ${params.environment.nodeVersion}`]
                : []),
            ``,
            `*Click for more details or to switch toolchain*`,
        ]

        langStatusBar.tooltip = new vscode.MarkdownString(tooltipLines.join("\n"))
        langStatusBar.command = "tolk.showToolchainInfo"
        langStatusBar.show()
    })

    return new vscode.Disposable(() => {
        disposables.forEach(d => void d.dispose())
    })
}

async function resolveFile(filePath: string): Promise<vscode.Uri> {
    if (path.isAbsolute(filePath)) {
        return vscode.Uri.file(filePath)
    } else {
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error("No workspace folder found")
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath
        const fullPath = path.join(workspaceRoot, "contracts", filePath)

        try {
            const uri = vscode.Uri.file(fullPath)
            await vscode.workspace.fs.stat(uri)
            return uri
        } catch {
            const foundFiles = await vscode.workspace.findFiles(
                `**/${path.basename(filePath)}`,
                "**/node_modules/**",
                10,
            )

            if (foundFiles.length === 0) {
                throw new Error(`File not found: ${filePath}`)
            }

            if (foundFiles.length === 1) {
                return foundFiles[0]
            } else {
                // Ищем точное совпадение пути
                const exactMatch = foundFiles.find(
                    file => file.fsPath.endsWith(filePath) || file.fsPath.includes(filePath),
                )
                return exactMatch ?? foundFiles[0]
            }
        }
    }
}

function registerCommands(disposables: vscode.Disposable[]): void {
    disposables.push(
        vscode.commands.registerCommand("tolk.showToolchainInfo", async () => {
            if (!cachedToolchainInfo) {
                vscode.window.showInformationMessage("Toolchain information not available")
                return
            }

            const info = cachedToolchainInfo
            const config = vscode.workspace.getConfiguration("ton")
            const activeToolchainId = config.get<string>("tolk.toolchain.activeToolchain", "auto")
            const toolchains = config.get<Record<string, ToolchainConfig | undefined>>(
                "tolk.toolchain.toolchains",
                {},
            )
            const activeToolchainName = toolchains[activeToolchainId]?.name ?? "Unknown"

            const items = [
                {
                    label: "$(info) Version Information",
                    detail: `Tolk ${info.version.number}`,
                    description: info.version.commit
                        ? `Commit: ${info.version.commit}`
                        : "No commit info",
                },
                {
                    label: "$(tools) Active Toolchain",
                    detail: `${activeToolchainName} (${activeToolchainId})`,
                    description: info.toolchain.path,
                },
                {
                    label: "$(device-desktop) Environment",
                    detail: `${info.environment.platform} ${info.environment.arch}`,
                    description: info.environment.nodeVersion
                        ? `Node.js ${info.environment.nodeVersion}`
                        : "Node.js version unknown",
                },
                {
                    label: "$(arrow-swap) Switch Toolchain",
                    detail: "Change active toolchain",
                    description: "Select a different toolchain configuration",
                    action: "switch",
                },
                {
                    label: "$(settings-gear) Manage Toolchains",
                    detail: "Add, remove, or configure toolchains",
                    description: "Open toolchain management",
                    action: "manage",
                },
                {
                    label: "$(copy) Copy Information",
                    detail: "Copy toolchain info to clipboard",
                    description: "Copy all toolchain details",
                    action: "copy",
                },
            ]

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: "Tolk Toolchain Information",
                canPickMany: false,
            })

            if (selected) {
                switch (selected.action) {
                    case "switch": {
                        await vscode.commands.executeCommand("tolk.selectToolchain")
                        break
                    }
                    case "manage": {
                        await vscode.commands.executeCommand("tolk.manageToolchains")
                        break
                    }
                    case "copy": {
                        const clipboardText = `Tolk Toolchain Information:
Version: ${info.version.number}
Commit: ${info.version.commit || "Unknown"}
Active Toolchain: ${activeToolchainName} (${activeToolchainId})
Path: ${info.toolchain.path}
Auto-detected: ${info.toolchain.isAutoDetected}
Detection method: ${info.toolchain.detectionMethod ?? "Unknown"}
Platform: ${info.environment.platform}
Architecture: ${info.environment.arch}
Node.js: ${info.environment.nodeVersion ?? "Unknown"}`

                        await vscode.env.clipboard.writeText(clipboardText)
                        vscode.window.showInformationMessage(
                            "Toolchain information copied to clipboard",
                        )
                        break
                    }
                    case undefined: {
                        break
                    }
                }
            }
        }),
        vscode.commands.registerCommand(
            TypeAtPositionRequest,
            async (params: TypeAtPositionParams | undefined) => {
                if (!client) {
                    return null
                }

                const isFromEditor = !params
                if (!params) {
                    const editor = vscode.window.activeTextEditor
                    if (!editor) {
                        return null
                    }

                    params = {
                        textDocument: {
                            uri: editor.document.uri.toString(),
                        },
                        position: {
                            line: editor.selection.active.line,
                            character: editor.selection.active.character,
                        },
                    }
                }

                const result = await client.sendRequest<TypeAtPositionResponse>(
                    TypeAtPositionRequest,
                    params,
                )

                if (isFromEditor && result.type) {
                    const editor = vscode.window.activeTextEditor
                    if (editor && result.range) {
                        const range = new Range(
                            new Position(result.range.start.line, result.range.start.character),
                            new Position(result.range.end.line, result.range.end.character),
                        )

                        editor.selections = [new vscode.Selection(range.start, range.end)]
                        editor.revealRange(range)
                    }

                    void vscode.window.showInformationMessage(`Type: ${result.type}`)
                }

                return result
            },
        ),
        vscode.commands.registerCommand(
            DocumentationAtPositionRequest,
            async (params: TypeAtPositionParams | undefined) => {
                if (!client || !params) {
                    return null
                }

                return client.sendRequest<TypeAtPositionResponse>(
                    DocumentationAtPositionRequest,
                    params,
                )
            },
        ),
        vscode.commands.registerCommand("tolk.selectToolchain", async () => {
            const config = vscode.workspace.getConfiguration("ton")
            const toolchains = config.get<Record<string, ToolchainConfig>>(
                "tolk.toolchain.toolchains",
                {},
            )
            const activeToolchain = config.get<string>("tolk.toolchain.activeToolchain", "auto")

            const items = Object.entries(toolchains).map(([id, toolchain]) => ({
                label: `$(${id === activeToolchain ? "check" : "circle-outline"}) ${toolchain.name}`,
                description: toolchain.description ?? "",
                detail: toolchain.path || "Auto-detected",
                id: id,
                picked: id === activeToolchain,
            }))

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: "Select active toolchain",
                canPickMany: false,
            })

            if (selected && selected.id !== activeToolchain) {
                await config.update(
                    "tolk.toolchain.activeToolchain",
                    selected.id,
                    vscode.ConfigurationTarget.Workspace,
                )
                vscode.window.showInformationMessage(
                    `Switched to toolchain: ${selected.label.replace(/^\$\([^)]+\)\s*/, "")}`,
                )
            }
        }),
        vscode.commands.registerCommand("tolk.manageToolchains", async () => {
            const config = vscode.workspace.getConfiguration("ton")
            const toolchains = config.get<Record<string, ToolchainConfig>>(
                "tolk.toolchain.toolchains",
                {},
            )

            const items = [
                {
                    label: "$(add) Add New Toolchain",
                    description: "Add a new Tolk toolchain configuration",
                    action: "add",
                },
                {
                    label: "$(list-unordered) List All Toolchains",
                    description: "View all configured toolchains",
                    action: "list",
                },
                {
                    label: "$(trash) Remove Toolchain",
                    description: "Remove an existing toolchain configuration",
                    action: "remove",
                },
            ]

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: "Manage Tolk Toolchains",
            })

            if (selected) {
                switch (selected.action) {
                    case "add": {
                        await vscode.commands.executeCommand("tolk.addToolchain")
                        break
                    }
                    case "list": {
                        const toolchainItems = Object.entries(toolchains).map(
                            ([id, toolchain]) => ({
                                label: toolchain.name,
                                description: toolchain.description ?? "",
                                detail: `ID: ${id}, Path: ${toolchain.path || "Auto-detected"}`,
                            }),
                        )

                        await vscode.window.showQuickPick(toolchainItems, {
                            placeHolder: "Configured Toolchains",
                        })
                        break
                    }
                    case "remove": {
                        await vscode.commands.executeCommand("tolk.removeToolchain")
                        break
                    }
                }
            }
        }),
        vscode.commands.registerCommand("tolk.addToolchain", async () => {
            const id = await vscode.window.showInputBox({
                prompt: "Enter unique ID for the new toolchain",
                placeHolder: "e.g., tolk-0.99.0, local-build",
                validateInput: (value: string) => {
                    if (!value.trim()) return "ID cannot be empty"
                    if (!/^[\w-]+$/.test(value))
                        return "ID can only contain letters, numbers, hyphens, and underscores"

                    const config = vscode.workspace.getConfiguration("ton")
                    const toolchains = config.get<Record<string, ToolchainConfig | undefined>>(
                        "tolk.toolchain.toolchains",
                        {},
                    )
                    if (toolchains[value]) return "A toolchain with this ID already exists"

                    return null
                },
            })

            if (!id) return

            const name = await vscode.window.showInputBox({
                prompt: "Enter display name for the toolchain",
                placeHolder: "e.g., Tolk 0.99.0, Local Development Build",
            })

            if (!name) return

            const pathOptions = [
                {label: "$(file-directory) Browse for executable", action: "browse"},
                {label: "$(edit) Enter path manually", action: "manual"},
            ]

            const pathOption = await vscode.window.showQuickPick(pathOptions, {
                placeHolder: "How would you like to specify the compiler path?",
            })

            if (!pathOption) return

            let path = ""
            if (pathOption.action === "browse") {
                const fileUri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: {
                        Executables: process.platform === "win32" ? ["exe"] : ["*"],
                    },
                    title: "Select Tolk Compiler Executable",
                })

                if (fileUri && fileUri[0]) {
                    path = fileUri[0].fsPath
                }
            } else {
                const manualPath = await vscode.window.showInputBox({
                    prompt: "Enter path to Tolk compiler executable",
                    placeHolder: "/usr/local/ton/tolk or ./node_modules/.bin/tolk-js",
                })
                if (manualPath) {
                    path = manualPath
                }
            }

            if (!path) return

            const description = await vscode.window.showInputBox({
                prompt: "Enter optional description for the toolchain",
                placeHolder: "e.g., Latest stable version, Development build",
            })

            const config = vscode.workspace.getConfiguration("ton")
            const toolchains = config.get<Record<string, ToolchainConfig | undefined>>(
                "tolk.toolchain.toolchains",
                {},
            )

            toolchains[id] = {
                name,
                path,
                ...(description && {description}),
            }

            await config.update(
                "tolk.toolchain.toolchains",
                toolchains,
                vscode.ConfigurationTarget.Workspace,
            )

            const activateNow = await vscode.window.showInformationMessage(
                `Added toolchain: ${name}. Do you want to activate it now?`,
                "Activate",
                "Keep Current",
            )

            if (activateNow === "Activate") {
                await config.update(
                    "tolk.toolchain.activeToolchain",
                    id,
                    vscode.ConfigurationTarget.Workspace,
                )
                vscode.window.showInformationMessage(`Activated toolchain: ${name}`)
            } else {
                vscode.window.showInformationMessage(`Toolchain ${name} added but not activated`)
            }
        }),
        vscode.commands.registerCommand("tolk.removeToolchain", async () => {
            const config = vscode.workspace.getConfiguration("ton")
            const toolchains = config.get<Record<string, ToolchainConfig>>(
                "tolk.toolchain.toolchains",
                {},
            )
            const activeToolchain = config.get<string>("tolk.toolchain.activeToolchain", "auto")

            const removableToolchains = Object.entries(toolchains).filter(([id]) => id !== "auto")

            if (removableToolchains.length === 0) {
                vscode.window.showInformationMessage("No removable toolchains found")
                return
            }

            const items = removableToolchains.map(([id, toolchain]) => ({
                label: toolchain.name,
                description: toolchain.description ?? "",
                detail: `ID: ${id}, Path: ${toolchain.path}`,
                id: id,
            }))

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: "Select toolchain to remove",
            })

            if (!selected) return

            const confirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to remove the toolchain "${selected.label}"?`,
                {modal: true},
                "Remove",
                "Cancel",
            )

            if (confirmation === "Remove") {
                // Create a new object without the selected toolchain instead of modifying the existing one
                const updatedToolchains = Object.fromEntries(
                    Object.entries(toolchains).filter(([id]) => id !== selected.id),
                )

                await config.update(
                    "tolk.toolchain.toolchains",
                    updatedToolchains,
                    vscode.ConfigurationTarget.Workspace,
                )

                if (activeToolchain === selected.id) {
                    await config.update(
                        "tolk.toolchain.activeToolchain",
                        "auto",
                        vscode.ConfigurationTarget.Workspace,
                    )
                    vscode.window.showInformationMessage(
                        `Removed toolchain "${selected.label}" and switched to auto-detection`,
                    )
                } else {
                    vscode.window.showInformationMessage(`Removed toolchain: ${selected.label}`)
                }
            }
        }),
        vscode.commands.registerCommand("ton.copyToClipboard", (str: string) => {
            void vscode.env.clipboard.writeText(str)
            void vscode.window.showInformationMessage(`Copied ${str} to clipboard`)
        }),
        vscode.commands.registerCommand("ton.openFile", async (filePath: string, line?: number) => {
            try {
                const uri = await resolveFile(filePath)
                const document = await vscode.workspace.openTextDocument(uri)
                const editor = await vscode.window.showTextDocument(document)

                if (line !== undefined && line > 0) {
                    const position = new vscode.Position(line - 1, 0)
                    editor.selection = new vscode.Selection(position, position)
                    editor.revealRange(
                        new vscode.Range(position, position),
                        vscode.TextEditorRevealType.InCenter,
                    )
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open file: ${filePath}`)
                console.error("Error opening file:", error)
            }
        }),
    )
}

function registerBocWatcher(bocDecompilerProvider: BocDecompilerProvider): FileSystemWatcher {
    const bocWatcher = vscode.workspace.createFileSystemWatcher("**/*.boc")

    bocWatcher.onDidChange((uri: vscode.Uri) => {
        const decompileUri = uri.with({
            scheme: BocDecompilerProvider.scheme,
            path: uri.path + ".decompiled.tasm",
        })

        const openDocument = vscode.workspace.textDocuments.find(
            doc => doc.uri.toString() === decompileUri.toString(),
        )

        if (openDocument) {
            bocDecompilerProvider.update(decompileUri)
        }
    })

    bocWatcher.onDidDelete((uri: vscode.Uri) => {
        const decompileUri = uri.with({
            scheme: BocDecompilerProvider.scheme,
            path: uri.path + ".decompiled.tasm",
        })

        const openDocument = vscode.workspace.textDocuments.find(
            doc => doc.uri.toString() === decompileUri.toString(),
        )

        if (openDocument) {
            bocDecompilerProvider.update(decompileUri)
        }
    })

    bocWatcher.onDidCreate((uri: vscode.Uri) => {
        const decompileUri = uri.with({
            scheme: BocDecompilerProvider.scheme,
            path: uri.path + ".decompiled.tasm",
        })

        const openDocument = vscode.workspace.textDocuments.find(
            doc => doc.uri.toString() === decompileUri.toString(),
        )

        if (openDocument) {
            bocDecompilerProvider.update(decompileUri)
        }
    })
    return bocWatcher
}

async function checkConflictingExtensions(): Promise<void> {
    const conflictingExtensions = [
        {id: "tonwhales.func-vscode", name: "FunC"},
        {id: "ton-core.tolk-vscode", name: "Tolk"},
        {id: "krigga.tvm-debugger", name: "TVM Debugger"},
    ]

    const installedConflicting = conflictingExtensions.filter(ext => {
        const extension = vscode.extensions.getExtension(ext.id)
        return extension && extension.isActive
    })

    if (installedConflicting.length === 0) {
        return
    }

    const extensionNames = installedConflicting.map(ext => ext.name).join(", ")
    const message = `Conflicting extensions detected: ${extensionNames}. We recommended to disable them to avoid conflicts. TON extension already includes the same functionality.`

    const action = await vscode.window.showWarningMessage(
        message,
        "Show conflicting extensions",
        "Ignore",
    )

    if (action === "Show conflicting extensions") {
        await vscode.commands.executeCommand("workbench.view.extensions")

        await vscode.commands.executeCommand(
            "workbench.extensions.search",
            `@id:${installedConflicting[0].id}`,
        )
    }
}
