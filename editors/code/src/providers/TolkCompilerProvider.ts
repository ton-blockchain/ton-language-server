//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import vscode from "vscode"
import {ToolchainConfig} from "@server/settings/settings"
import {Toolchain} from "@server/languages/tolk/toolchain/toolchain"
import {Cell, runtime as i, trace, text} from "ton-assembly"

export interface CompilationResult {
    readonly success: boolean
    readonly code?: string
    readonly error?: string
    readonly output?: string
    readonly mapping?: TolkMapping
    readonly mappingInfo?: trace.MappingInfo
}

export interface TolkSourceLoc {
    readonly file: string
    readonly line: number
    readonly pos: number
    readonly vars: undefined | string[]
    readonly func: string
    readonly first_stmt: undefined | boolean
    readonly ret: undefined | boolean
}

export interface TolkGlobalVar {
    readonly name: string
}

export interface TolkMapping {
    readonly globals: readonly TolkGlobalVar[]
    readonly locations: readonly TolkSourceLoc[]
}

interface TolkCompilerOutput {
    readonly artifactVersion: number
    readonly tolkVersion: string
    readonly fiftCode: string
    readonly codeBoc64: string
    readonly codeHashHex: string
    readonly debugInfo?: TolkMapping
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
            const [cell, mapping, mappingInfo] = await this.compileWithBinary(
                contractCode,
                toolchain.compilerPath,
            )
            return {
                success: true,
                output: "",
                code: cell.toBoc().toString("base64"),
                mapping,
                mappingInfo,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown compilation error",
            }
        }
    }

    private async compileWithBinary(
        code: string,
        toolchainPath: string,
    ): Promise<[Cell, TolkMapping, trace.MappingInfo]> {
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
                    `"${toolchainPath}" "${contractFileUri.fsPath}" --debug true --output-json "${outputFileUri.fsPath}"`,
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

            const outputBuffer = await vscode.workspace.fs.readFile(outputFileUri)
            const outputJson = Buffer.from(outputBuffer).toString("utf8")
            const result = JSON.parse(outputJson) as TolkCompilerOutput

            const codeCell = Cell.fromBase64(result.codeBoc64)

            const initialInstructions = i.decompileCell(codeCell)
            const [cell, mapping] = recompileCell(codeCell)

            const mappingInfo = trace.createMappingInfo(mapping)

            return [cell, result.debugInfo ?? {globals: [], locations: []}, mappingInfo]
        } catch (error) {
            if (error instanceof Error) {
                throw new TypeError(`Compilation failed: ${error.message}`)
            }
            throw new TypeError("Unknown compilation error")
        } finally {
            try {
                // await vscode.workspace.fs.delete(tempFolderUri, {recursive: true})
            } catch {}
        }
    }
}

const recompileCell = (cell: Cell): [Cell, i.Mapping] => {
    const instructionsWithoutPositions = i.decompileCell(cell)
    const assemblyForPositions = text.print(instructionsWithoutPositions)

    const parseResult = text.parse("out.tasm", assemblyForPositions)
    if (parseResult.$ === "ParseFailure") {
        throw new Error("Cannot parse resulting text Assembly")
    }

    return i.compileCellWithMapping(parseResult.instructions)
}
