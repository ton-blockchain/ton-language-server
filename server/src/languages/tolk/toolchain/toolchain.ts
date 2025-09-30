//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as path from "node:path"
import * as cp from "node:child_process"
import {SpawnSyncReturns} from "node:child_process"
import * as console from "node:console"
import * as os from "node:os"

import * as process from "node:process"

import {EnvironmentInfo, ToolchainInfo} from "@shared/shared-msgtypes"
import {existsVFS, globalVFS} from "@server/vfs/files-adapter"
import {filePathToUri} from "@server/files"
import {trimPrefix} from "@server/utils/strings"

export class InvalidToolchainError extends Error {
    public constructor(message: string) {
        super(message)
        this.name = "InvalidToolchainError"
    }
}

export class Toolchain {
    public readonly compilerPath: string
    public readonly isAutoDetected: boolean
    public readonly detectionMethod?: string
    public version: {
        number: string
        commit: string
    }

    public constructor(
        compilerPath: string,
        isAutoDetected: boolean = false,
        detectionMethod?: string,
    ) {
        this.compilerPath = compilerPath
        this.isAutoDetected = isAutoDetected
        this.detectionMethod = detectionMethod
        this.version = {
            number: "",
            commit: "",
        }
    }

    public static async autoDetect(root: string): Promise<Toolchain> {
        const candidatesPaths = [
            path.join(root, "node_modules", ".bin", "tolk-js"),
            ...tolkCompilerSearchPaths(),
        ]
        const foundPath = await Toolchain.findDirectory(candidatesPaths)
        if (!foundPath) {
            console.info(`cannot find toolchain in:`)
            for (const path of candidatesPaths) {
                console.info(path)
            }
            return fallbackToolchain
        }

        const detectionMethod = foundPath.includes("node_modules") ? "node_modules" : "project_bin"
        return new Toolchain(foundPath, true, detectionMethod).setVersion()
    }

    public static fromPath(path: string): Toolchain {
        return new Toolchain(path, false, "manual").validate()
    }

    public getEnvironmentInfo(): EnvironmentInfo {
        try {
            const result = cp.execSync("node --version", {encoding: "utf8"})
            return {
                nodeVersion: result.trim(),
                platform: os.platform(),
                arch: os.arch(),
            }
        } catch {
            // node version not available
        }

        return {
            nodeVersion: undefined,
            platform: os.platform(),
            arch: os.arch(),
        }
    }

    public getToolchainInfo(): ToolchainInfo {
        return {
            path: this.compilerPath,
            isAutoDetected: this.isAutoDetected,
            detectionMethod: this.detectionMethod,
        }
    }

    private setVersion(): this {
        try {
            const result = cp.execSync(`"${this.compilerPath}" -v`)
            const rawVersion = result.toString()
            const lines = rawVersion.split("\n")
            const version = trimPrefix(lines[0] ?? "", "Tolk compiler v")
            const commit = trimPrefix(lines[1] ?? "", "Build commit:")

            this.version = {
                number: version,
                commit: commit,
            }
        } catch {
            // ignore errors here for now
        }
        return this
    }

    private validate(): this {
        try {
            const result = cp.execSync(`"${this.compilerPath}" -v`)
            const rawVersion = result.toString()
            const lines = rawVersion.split("\n")
            const version = trimPrefix(lines[0] ?? "", "Tolk compiler v")
            const commit = trimPrefix(lines[1] ?? "", "Build commit: ")

            this.version = {
                number: version,
                commit: commit,
            }
        } catch (error_: unknown) {
            const error = error_ as SpawnSyncReturns<Buffer>

            console.log(error.stdout.toString())
            console.log(error.stderr.toString())

            const tip = `Please recheck path or leave it empty to LS find toolchain automatically`

            if (error.stderr.includes("not found")) {
                throw new InvalidToolchainError(
                    `Cannot find valid Tolk executable in "${this.compilerPath}"! ${tip}`,
                )
            }

            throw new InvalidToolchainError(
                `Path ${this.compilerPath} is invalid! ${tip}: ${error.stderr.toString()}`,
            )
        }

        return this
    }

    public toString(): string {
        return `Toolchain(path=${this.compilerPath}, version=${this.version.number}:${this.version.commit})`
    }

    private static async findDirectory(dir: string[]): Promise<string | null> {
        for (const searchDir of dir) {
            if (await existsVFS(globalVFS, filePathToUri(searchDir))) {
                return searchDir
            }
        }

        return null
    }
}

export let projectTolkStdlibPath: string | null = null

export function setProjectTolkStdlibPath(path: string | null): void {
    projectTolkStdlibPath = path
}

export const fallbackToolchain = new Toolchain("./node_modules/.bin/tolk-js", true, "fallback")

export const TOLK_KNOWN_PLATFORMS: Record<string, [string, string][] | undefined> = {
    linux: [["/usr/bin/tolk", "../share/ton/smartcont/tolk-stdlib"]],
    darwin: [
        ["/opt/homebrew/bin/tolk", "../share/ton/ton/smartcont/tolk-stdlib"],
        ["/usr/local/bin/tolk", "../share/ton/ton/smartcont/tolk-stdlib"],
    ],
    win32: [["C:\\ProgramData\\chocolatey\\lib\\ton\\bin\\tolk.exe", "smartcont/tolk-stdlib"]],
}

export function tolkStdlibSearchPaths(): string[] {
    return (TOLK_KNOWN_PLATFORMS[process.platform] ?? []).map(
        ([compilerBinaryPath, relativeStdlibFolder]) => {
            return path.join(path.dirname(compilerBinaryPath), relativeStdlibFolder)
        },
    )
}

export function tolkCompilerSearchPaths(): string[] {
    return (TOLK_KNOWN_PLATFORMS[process.platform] ?? []).map(([compilerBinaryPath]) => {
        return compilerBinaryPath
    })
}
