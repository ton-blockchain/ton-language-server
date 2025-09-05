//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {Cell} from "@ton/core"
import vscode from "vscode"
import {ToolchainConfig} from "@server/settings/settings"
import {Toolchain} from "@server/languages/tolk/toolchain/toolchain"

export interface CompilationResult {
    readonly success: boolean
    readonly code?: string
    readonly error?: string
    readonly output?: string
}

interface TolkCompilerOutput {
    readonly artifactVersion: number
    readonly tolkVersion: string
    readonly fiftCode: string
    readonly codeBoc64: string
    readonly codeHashHex: string
    readonly sourcesSnapshot: {
        readonly filename: string
        readonly contents: string
    }[]
}

export class TolkCompilerProvider {
    private static instance: TolkCompilerProvider | undefined

    public static getInstance(): TolkCompilerProvider {
        if (!TolkCompilerProvider.instance) {
            TolkCompilerProvider.instance = new TolkCompilerProvider()
        }

        return TolkCompilerProvider.instance
    }

    public async compileContract(contractCode: string): Promise<CompilationResult> {
        const settings = vscode.workspace.getConfiguration("ton")
        const activeToolchainId = settings.get<string>("tolk.toolchain.activeToolchain", "auto")
        const toolchains = settings.get<Record<string, ToolchainConfig | undefined>>(
            "tolk.toolchain.toolchains",
            {},
        )
        const activeToolchain = toolchains[activeToolchainId]

        if (!activeToolchain) {
            return {
                success: false,
                error: "No active toolchain",
            }
        }

        const toolchain: Toolchain =
            activeToolchain.path === ""
                ? await Toolchain.autoDetect(
                      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
                  )
                : Toolchain.fromPath(activeToolchain.path)

        try {
            const cell = await this.compileWithBinary(contractCode, toolchain.compilerPath)
            return {
                success: true,
                output: "",
                code: cell.toBoc().toString("base64"),
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown compilation error",
            }
        }
    }

    private async compileWithBinary(code: string, toolchainPath: string): Promise<Cell> {
        const tempFolderUri = vscode.Uri.joinPath(
            vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(process.cwd()),
            ".tolk-temp-" + Date.now(),
        )
        const contractFileUri = vscode.Uri.joinPath(tempFolderUri, "main.tolk")
        const outputFileUri = vscode.Uri.joinPath(tempFolderUri, "out.json")

        try {
            await vscode.workspace.fs.createDirectory(tempFolderUri)

            const codeBuffer = Buffer.from(code, "utf8")
            await vscode.workspace.fs.writeFile(contractFileUri, codeBuffer)

            const taskDefinition: vscode.TaskDefinition = {
                type: "shell",
            }

            const task = new vscode.Task(
                taskDefinition,
                vscode.TaskScope.Workspace,
                "Tolk Compile",
                "tolk",
                new vscode.ShellExecution(
                    `"${toolchainPath}" "${contractFileUri.fsPath}" --output-json "${outputFileUri.fsPath}"`,
                ),
            )

            await new Promise<void>((resolve, reject) => {
                const disposable = vscode.tasks.onDidEndTask(e => {
                    if (e.execution.task === task) {
                        disposable.dispose()
                        if (e.execution.task.execution) {
                            resolve()
                        } else {
                            reject(new TypeError("Task execution failed"))
                        }
                    }
                })

                void vscode.tasks.executeTask(task)
            })

            const outputBuffer = await vscode.workspace.fs.readFile(outputFileUri)
            const outputJson = Buffer.from(outputBuffer).toString("utf8")
            const result = JSON.parse(outputJson) as TolkCompilerOutput

            return Cell.fromBase64(result.codeBoc64)
        } catch (error) {
            if (error instanceof Error) {
                throw new TypeError(`Compilation failed: ${error.message}`)
            }
            throw new TypeError("Unknown compilation error")
        } finally {
            try {
                await vscode.workspace.fs.delete(tempFolderUri, {recursive: true})
            } catch {}
        }
    }
}
