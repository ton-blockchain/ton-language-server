//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import vscode, {Uri} from "vscode"
import {ToolchainConfig} from "@server/settings/settings"
import {Toolchain} from "@server/languages/tolk/toolchain/toolchain"
import {Cell, runtime as i, trace, text} from "ton-assembly"
import {SourceMap} from "ton-assembly/dist/trace"

export interface CompilationResult {
    readonly success: boolean
    readonly code?: string
    readonly error?: string
    readonly output?: string
    readonly sourceMap?: TolkSourceMap
}

export interface TolkSourceMap {
    readonly sourcemap?: SourceMap
    readonly mappingInfo: trace.MappingInfo
}

interface TolkCompilerOutput {
    readonly artifactVersion: number
    readonly tolkVersion: string
    readonly fiftCode: string
    readonly codeBoc64: string
    readonly debugCodeBoc64?: string
    readonly codeHashHex: string
    readonly sourceMap?: TolkSourceMap
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
                code: cell.toBoc().toString("base64"),
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
    ): Promise<[Cell, TolkSourceMap]> {
        const tempFolderUri = vscode.Uri.joinPath(
            vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(process.cwd()),
            ".tolk-temp-" + Date.now(),
        )
        const outputFileUri = vscode.Uri.joinPath(tempFolderUri, "out.json")

        try {
            await vscode.workspace.fs.createDirectory(tempFolderUri)

            const taskDefinition: vscode.TaskDefinition = {
                type: "shell",
            }

            const task = new vscode.Task(
                taskDefinition,
                vscode.TaskScope.Workspace,
                "Tolk Compile",
                "tolk",
                new vscode.ShellExecution(
                    `"${toolchainPath}" "${contractFilePath.fsPath}" --source-map true --output-json "${outputFileUri.fsPath}"`,
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

            const codeCell = Cell.fromBase64(result.debugCodeBoc64 ?? result.codeBoc64)

            const initialInstructions = i.decompileCell(codeCell)
            const [cell, mapping] = recompileCell(codeCell)

            return [cell, result.sourceMap ?? ({} as TolkSourceMap)]
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
