//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {Cell} from "@ton/core"
import vscode from "vscode"
import {ToolchainConfig} from "@server/settings/settings"
import {exec} from "node:child_process"
import {promisify} from "node:util"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import {Toolchain} from "@server/languages/tolk/toolchain/toolchain"

const execAsync = promisify(exec)

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
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "tolk-compile-"))
        const contractFile = path.join(tempDir, "main.tolk")
        const outputFile = path.join(tempDir, "out.json")

        try {
            await fs.promises.writeFile(contractFile, code, "utf8")

            const tolkBinary = path.join(toolchainPath)
            const command = `"${tolkBinary}" "${contractFile}" --output-json "${outputFile}"`
            const {stdout, stderr} = await execAsync(command)
            console.log("stdout:", stdout)
            console.log("stderr:", stderr)

            const outputJson = await fs.promises.readFile(outputFile, "utf8")
            const result = JSON.parse(outputJson) as TolkCompilerOutput

            return Cell.fromBase64(result.codeBoc64)
        } catch (error) {
            if (error instanceof Error) {
                throw new TypeError(`Compilation failed: ${error.message}`)
            }
            throw new TypeError("Unknown compilation error")
        } finally {
            try {
                await fs.promises.rm(tempDir, {recursive: true})
            } catch {}
        }
    }
}
