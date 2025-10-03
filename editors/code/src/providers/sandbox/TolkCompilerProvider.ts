//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {promisify} from "node:util"

import {execFile} from "node:child_process"

import vscode, {Uri} from "vscode"

import {Cell} from "ton-assembly"

import {SourceMap} from "ton-source-map"

import {ToolchainConfig} from "@server/settings/settings"
import {Toolchain} from "@server/languages/tolk/toolchain/toolchain"

import {Base64String} from "../../common/base64-string"

export interface CompilationResult {
    readonly success: boolean
    readonly code?: Base64String
    readonly error?: string
    readonly output?: string
    readonly sourceMap?: SourceMap
}

interface TolkCompilerOutput {
    readonly artifactVersion: number
    readonly tolkVersion: string
    readonly fiftCode: string
    readonly codeBoc64: Base64String
    readonly debugCodeBoc64?: Base64String
    readonly codeHashHex: string
    readonly fiftSourceMapCode?: string
    readonly sourceMapCodeRecompiledBoc64?: Base64String
    readonly sourceMapCodeBoc64?: Base64String
    readonly sourceMap?: SourceMap
    readonly sourcesSnapshot: {
        readonly filename: string
        readonly contents: string
    }[]
}

export class TolkCompilerProvider {
    private static instance: TolkCompilerProvider | undefined

    public static getInstance(): TolkCompilerProvider {
        TolkCompilerProvider.instance ??= new TolkCompilerProvider()
        return TolkCompilerProvider.instance
    }

    public async compileContract(contractFilePath: Uri): Promise<CompilationResult> {
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
            const [cell, sourceMap] = await this.compileWithBinary(
                contractFilePath,
                toolchain.compilerPath,
            )
            return {
                success: true,
                output: "",
                code: cell.toBoc().toString("base64") as Base64String,
                sourceMap,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown compilation error",
            }
        }
    }

    private async compileWithBinary(
        contractFilePath: Uri,
        toolchainPath: string,
    ): Promise<[Cell, SourceMap | undefined]> {
        const tempFolderUri = vscode.Uri.joinPath(
            vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(process.cwd()),
            ".tolk-temp-" + Date.now(),
        )
        const outputFileUri = vscode.Uri.joinPath(tempFolderUri, "out.json")

        try {
            await vscode.workspace.fs.createDirectory(tempFolderUri)

            const supportsSourceMaps = await compilerSupportsSourceMaps(toolchainPath)
            if (!supportsSourceMaps) {
                console.log("Source maps are not supported by the Tolk compiler!")
            }

            const taskDefinition: vscode.TaskDefinition = {
                type: "shell",
            }

            const sourceMapArg = supportsSourceMaps ? "--source-map" : ""
            const task = new vscode.Task(
                taskDefinition,
                vscode.TaskScope.Workspace,
                "Tolk Compile",
                "tolk",
                new vscode.ShellExecution(
                    `"${toolchainPath}" ${sourceMapArg} --output-json "${outputFileUri.fsPath}" "${contractFilePath.fsPath}"`,
                ),
            )

            task.presentationOptions = {
                reveal: vscode.TaskRevealKind.Silent,
                panel: vscode.TaskPanelKind.Dedicated,
                showReuseMessage: false,
                clear: true,
                echo: false,
                focus: false,
                close: true,
            }

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

            const exists = await this.fileExists(outputFileUri)
            if (!exists) {
                throw new Error("check terminal for errors!")
            }

            const outputBuffer = await vscode.workspace.fs.readFile(outputFileUri)
            const outputJson = Buffer.from(outputBuffer).toString("utf8")
            const result = JSON.parse(outputJson) as TolkCompilerOutput

            const codeCell = Cell.fromBase64(
                result.sourceMapCodeRecompiledBoc64 ?? result.codeBoc64,
            )
            return [codeCell, result.sourceMap]
        } catch (error) {
            if (error instanceof Error) {
                throw new TypeError(error.message)
            }
            throw new TypeError("Unknown compilation error")
        } finally {
            try {
                await vscode.workspace.fs.delete(tempFolderUri, {recursive: true})
            } catch {}
        }
    }

    private async fileExists(outputFileUri: Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(outputFileUri)
        } catch {
            return false
        }
        return true
    }
}

const execFileP = promisify(execFile)

export async function compilerSupportsSourceMaps(cmd: string, cwd?: string): Promise<boolean> {
    try {
        const {stdout} = await execFileP(cmd, ["-h"], {
            cwd: cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            shell: false,
            windowsHide: true,
            maxBuffer: 10 * 1024 * 1024,
            env: {...process.env},
            timeout: 1000,
        })
        return stdout.includes("--source-map")
    } catch {
        return false
    }
}
