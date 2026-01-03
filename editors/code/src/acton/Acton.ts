//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as path from "node:path"
import * as child_process from "node:child_process"

import vscode from "vscode"

import {ActonCommand} from "./ActonCommand"

export class Acton {
    private static instance: Acton | undefined

    public static getInstance(): Acton {
        Acton.instance ??= new Acton()
        return Acton.instance
    }

    public async execute(command: ActonCommand, workingDirectory?: string): Promise<void> {
        const actonPath = this.getActonPath()
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
        const actonPath = this.getActonPath()
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

    private getActonPath(): string {
        const config = vscode.workspace.getConfiguration("ton")
        const path = config.get<string>("acton.path")
        if (path && path.trim() !== "") {
            return path
        }
        return "acton"
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
