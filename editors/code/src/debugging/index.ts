import * as path from "node:path"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as crypto from "node:crypto"

import {DebugAdapterExecutable, DebugSession} from "vscode"
import * as vscode from "vscode"
import {decompileCell} from "ton-assembly/dist/runtime"
import {Cell} from "@ton/core"
import {print} from "ton-assembly/dist/text"

const tempAssemblyFiles: Map<string, string> = new Map()

function decompileAssemblyCode(codeHex: string): string {
    try {
        const cell = Cell.fromHex(codeHex)
        const instructions = decompileCell(cell)
        return print(instructions)
    } catch (error) {
        console.error("Error decompiling assembly code:", error)
        return `// Error decompiling assembly code: ${error instanceof Error ? error.message : String(error)}\n`
    }
}

async function createTempAssemblyFile(codeHex: string, sessionId: string): Promise<string> {
    try {
        const assemblyCode = decompileAssemblyCode(codeHex)

        const tempDir = path.join(os.tmpdir(), "ton-assembly-debug")
        await fs.mkdir(tempDir, {recursive: true})

        const fileName = `assembly-${sessionId}.tasm`
        const filePath = path.join(tempDir, fileName)

        await fs.writeFile(filePath, assemblyCode, "utf8")

        tempAssemblyFiles.set(sessionId, filePath)

        console.log(`Created temp assembly file: ${filePath}`)
        return filePath
    } catch (error) {
        console.error("Error creating temp assembly file:", error)
        throw error
    }
}

async function cleanupTempFiles(sessionId: string): Promise<void> {
    try {
        const filePath = tempAssemblyFiles.get(sessionId)
        if (filePath) {
            await fs.unlink(filePath)
            tempAssemblyFiles.delete(sessionId)
            console.log(`Cleaned up temp file: ${filePath}`)
        }
    } catch (error) {
        console.error("Error cleaning up temp file:", error)
    }
}

export function configureDebugging(context: vscode.ExtensionContext): void {
    const extensionPath = vscode.extensions.getExtension("ton-core.vscode-ton")?.extensionPath
    if (!extensionPath) {
        throw new Error("Could not find TON extension path")
    }

    const serverPath = path.join(extensionPath, "dist", "debugging", "adapter", "server.js")

    context.subscriptions.push(
        // Assembly debug configuration
        vscode.debug.registerDebugConfigurationProvider("assembly", {
            provideDebugConfigurations() {
                return [
                    {
                        type: "assembly",
                        name: "Debug Assembly",
                        request: "launch",
                        code: "${command:ton.getAssemblyCode}",
                        vmLogs: "${command:ton.getVmLogs}",
                        stopOnEntry: true,
                    },
                ]
            },
        }),

        vscode.debug.registerDebugConfigurationProvider("tolk", {
            provideDebugConfigurations() {
                return [
                    {
                        type: "tolk",
                        name: "Debug Tolk",
                        request: "launch",
                        code: "${command:ton.getAssemblyCode}",
                        vmLogs: "${command:ton.getVmLogs}",
                        stopOnEntry: true,
                    },
                ]
            },
        }),

        vscode.debug.registerDebugAdapterDescriptorFactory("tolk", {
            createDebugAdapterDescriptor(_s: DebugSession, _e: DebugAdapterExecutable | undefined) {
                console.log("start debugging: createDebugAdapterDescriptor (tolk)")
                return new vscode.DebugAdapterServer(12345)
                // return new vscode.DebugAdapterExecutable("node", [serverPath], {
                //     cwd: path.dirname(serverPath),
                // })
            },
        }),
        vscode.commands.registerCommand("ton.debug", () => {
            void vscode.debug.startDebugging(undefined, {
                type: "tolk",
                name: "Debug Tolk",
                request: "launch",
            })
        }),
        vscode.commands.registerCommand(
            "ton.debugAssembly",
            async (code: string, vmLogs: string) => {
                console.log("start debugging", code, vmLogs)

                try {
                    const sessionId = crypto.randomBytes(8).toString("hex")

                    const assemblyFilePath = await createTempAssemblyFile(code, sessionId)

                    const assemblyUri = vscode.Uri.file(assemblyFilePath)
                    const doc = await vscode.workspace.openTextDocument(assemblyUri)
                    await vscode.window.showTextDocument(doc, {
                        preview: false,
                        preserveFocus: false,
                    })

                    const success = await vscode.debug.startDebugging(undefined, {
                        type: "assembly",
                        name: "Debug Assembly",
                        request: "launch",
                        code: code,
                        vmLogs: vmLogs,
                        program: assemblyFilePath,
                        stopOnEntry: true,
                    })

                    if (success) {
                        const disposable = vscode.debug.onDidTerminateDebugSession(session => {
                            if (session.name === "Debug Assembly") {
                                void cleanupTempFiles(sessionId)
                                disposable.dispose()
                            }
                        })
                    } else {
                        console.error("Failed to start debugging session")
                        await cleanupTempFiles(sessionId)
                    }
                } catch (error) {
                    console.error("Error starting assembly debugging:", error)
                    void vscode.window.showErrorMessage(
                        `Failed to start assembly debugging: ${error instanceof Error ? error.message : String(error)}`,
                    )
                }
            },
        ),
    )
}
