//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as fs from "node:fs/promises"
import {constants as fsConstants} from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import * as child_process from "node:child_process"

import vscode from "vscode"

import {ActonCommand} from "./ActonCommand"

const DEFAULT_INSTALL_PATH = path.join(os.homedir(), ".acton", "bin", "acton")

export class Acton {
    private static instance: Acton | undefined

    public static getInstance(): Acton {
        Acton.instance ??= new Acton()
        return Acton.instance
    }

    public async execute(command: ActonCommand, workingDirectory?: string): Promise<void> {
        const actonPath = await this.getActonPath(workingDirectory)
        const args = command.getArguments()

        const taskDefinition: vscode.TaskDefinition = {
            type: "acton",
            command: command.name,
            args: args,
        }

        const workspaceFolder = workingDirectory
            ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(workingDirectory))
            : vscode.workspace.workspaceFolders?.[0]

        const task = new vscode.Task(
            taskDefinition,
            workspaceFolder ?? vscode.TaskScope.Workspace,
            "acton",
            "acton",
            new vscode.ProcessExecution(actonPath, [command.name, ...args], {
                cwd: workingDirectory,
            }),
        )

        task.presentationOptions = {
            reveal: vscode.TaskRevealKind.Always,
            panel: vscode.TaskPanelKind.Dedicated,
            clear: true,
            showReuseMessage: false,
        }

        await vscode.tasks.executeTask(task)
    }

    public async spawn(
        command: ActonCommand,
        workingDirectory?: string,
        outputChannel?: vscode.OutputChannel,
        onOutput?: (data: string) => void,
    ): Promise<{exitCode: number | null; stdout: string; stderr: string}> {
        const actonPath = await this.getActonPath(workingDirectory)
        const args = [command.name, ...command.getArguments()]

        return new Promise((resolve, reject) => {
            const child = child_process.spawn(actonPath, args, {
                cwd: workingDirectory,
            })

            let stdout = ""
            let stderr = ""

            child.stdout.on("data", (data: Buffer) => {
                const str = data.toString()
                stdout += str
                outputChannel?.append(str)
                onOutput?.(str)
            })

            child.stderr.on("data", (data: Buffer) => {
                const str = data.toString()
                stderr += str
                outputChannel?.append(str)
                onOutput?.(str)
            })

            child.on("close", (code: number | null) => {
                resolve({exitCode: code, stdout, stderr})
            })

            child.on("error", (err: Error) => {
                reject(err)
            })
        })
    }

    public async isAvailable(workingDirectory?: string): Promise<boolean> {
        return (await this.resolveActonPath(workingDirectory)) !== undefined
    }

    public async syncConfiguredPath(): Promise<void> {
        if (!(await this.isExecutableFile(DEFAULT_INSTALL_PATH))) {
            return
        }

        const config = vscode.workspace.getConfiguration("ton")
        const configuredPath = this.getConfiguredPath(config)
        if (configuredPath === DEFAULT_INSTALL_PATH) {
            return
        }
        if (configuredPath && (await this.isResolvableExecutable(configuredPath))) {
            return
        }

        const inspected = config.inspect<string>("acton.path")
        const target =
            inspected?.workspaceValue === undefined
                ? vscode.ConfigurationTarget.Global
                : vscode.ConfigurationTarget.Workspace

        await config.update("acton.path", DEFAULT_INSTALL_PATH, target)
    }

    public async setConfiguredPath(actonPath: string): Promise<void> {
        const config = vscode.workspace.getConfiguration("ton")
        const inspected = config.inspect<string>("acton.path")
        const target =
            inspected?.workspaceValue === undefined
                ? vscode.ConfigurationTarget.Global
                : vscode.ConfigurationTarget.Workspace

        await config.update("acton.path", actonPath, target)
    }

    public getDefaultInstallPath(): string {
        return DEFAULT_INSTALL_PATH
    }

    public async hasWorkspaceProject(): Promise<boolean> {
        const actonTomlFiles = await vscode.workspace.findFiles(
            "**/Acton.toml",
            "**/{.git,node_modules,dist}/**",
            1,
        )
        return actonTomlFiles.length > 0
    }

    private getConfiguredPath(config: vscode.WorkspaceConfiguration): string | undefined {
        const actonPath = config.get<string>("acton.path")
        if (actonPath && actonPath.trim() !== "") {
            return actonPath.trim()
        }
        return undefined
    }

    private async getActonPath(workingDirectory?: string): Promise<string> {
        const resolvedPath = await this.resolveActonPath(workingDirectory)
        if (resolvedPath) {
            return resolvedPath
        }

        return this.getConfiguredPath(vscode.workspace.getConfiguration("ton")) ?? "acton"
    }

    private async resolveActonPath(workingDirectory?: string): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration("ton")
        const configuredPath = this.getConfiguredPath(config)
        const candidates = configuredPath
            ? [configuredPath, DEFAULT_INSTALL_PATH, "acton"]
            : [DEFAULT_INSTALL_PATH, "acton"]

        for (const candidate of candidates) {
            if (await this.isResolvableExecutable(candidate, workingDirectory)) {
                return this.looksLikePath(candidate)
                    ? this.resolvePathCandidate(candidate, workingDirectory)
                    : candidate
            }
        }

        return undefined
    }

    private async isResolvableExecutable(
        pathOrCommand: string,
        workingDirectory?: string,
    ): Promise<boolean> {
        if (this.looksLikePath(pathOrCommand)) {
            return this.isExecutableFile(this.resolvePathCandidate(pathOrCommand, workingDirectory))
        }

        return (await this.findInPath(pathOrCommand)) !== undefined
    }

    private async isExecutableFile(candidate: string): Promise<boolean> {
        try {
            const stat = await fs.stat(candidate)
            if (!stat.isFile()) {
                return false
            }

            await fs.access(
                candidate,
                process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
            )
            return true
        } catch {
            return false
        }
    }

    private async findInPath(command: string): Promise<string | undefined> {
        if (!command || this.looksLikePath(command)) {
            return undefined
        }

        const pathValue = process.env["PATH"]
        if (!pathValue) {
            return undefined
        }

        const pathEntries = pathValue.split(path.delimiter).filter(Boolean)
        const extensions =
            process.platform === "win32"
                ? (process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
                : [""]
        const candidates =
            process.platform === "win32" && path.extname(command) === ""
                ? [command, ...extensions.map(ext => `${command}${ext.toLowerCase()}`)]
                : [command]

        for (const entry of pathEntries) {
            for (const candidate of candidates) {
                const fullPath = path.join(entry, candidate)
                if (await this.isExecutableFile(fullPath)) {
                    return fullPath
                }
            }
        }

        return undefined
    }

    private looksLikePath(pathOrCommand: string): boolean {
        return (
            path.isAbsolute(pathOrCommand) ||
            pathOrCommand.includes("/") ||
            pathOrCommand.includes("\\") ||
            pathOrCommand.startsWith(".")
        )
    }

    private resolvePathCandidate(pathOrCommand: string, workingDirectory?: string): string {
        if (path.isAbsolute(pathOrCommand)) {
            return pathOrCommand
        }

        const baseDirectory =
            workingDirectory ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()

        return path.resolve(baseDirectory, pathOrCommand)
    }

    /**
     * Finds the nearest Acton.toml starting from the given file/directory and going up.
     */
    public async findActonToml(startUri: vscode.Uri): Promise<vscode.Uri | undefined> {
        let current = startUri
        const root = vscode.workspace.getWorkspaceFolder(startUri)?.uri

        for (let i = 0; i < 100; i++) {
            const tomlUri = vscode.Uri.joinPath(current, "Acton.toml")
            try {
                await vscode.workspace.fs.stat(tomlUri)
                return tomlUri
            } catch {
                // Not found
            }

            if (root && current.toString() === root.toString()) {
                break
            }

            const parent = vscode.Uri.file(path.dirname(current.fsPath))
            if (parent.toString() === current.toString()) {
                break
            }
            current = parent
        }

        return undefined
    }
}
