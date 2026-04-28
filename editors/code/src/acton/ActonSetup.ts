//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as child_process from "node:child_process"
import {existsSync} from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import * as vscode from "vscode"

import {Acton} from "./Acton"

const INSTALLATION_GUIDE_URL = "https://ton-blockchain.github.io/acton/docs/installation"
const INSTALL_COMMAND =
    "curl --proto '=https' --tlsv1.2 -LsSf https://github.com/i582/acton-public/releases/latest/download/acton-installer.sh | sh"
const INSTALL_ACTION = "Install Acton"
const CONFIGURE_ACTION = "Configure Path"
const DOCS_ACTION = "Open Installation Guide"
const OPEN_LOG_ACTION = "Open Log"
const RETRY_ACTION = "Retry"
const OUTPUT_CHANNEL_NAME = "Acton Installation"

interface InstallerResult {
    readonly exitCode: number | null
    readonly signal: NodeJS.Signals | null
    readonly stdout: string
    readonly stderr: string
    readonly error?: Error
}

let missingActonPromptShown = false
let missingActonPromptPending = false
let installInProgress = false
let installationOutputChannel: vscode.OutputChannel | undefined

export function registerActonSetupNotifications(context: vscode.ExtensionContext): void {
    installationOutputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME)

    const recheck = (): void => {
        void promptToInstallActonIfNeeded()
    }

    context.subscriptions.push(
        installationOutputChannel,
        vscode.workspace.onDidOpenTextDocument(document => {
            if (path.basename(document.fileName) === "Acton.toml") {
                recheck()
            }
        }),
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            missingActonPromptShown = false
            recheck()
        }),
        vscode.workspace.onDidCreateFiles(event => {
            if (event.files.some(file => path.basename(file.fsPath) === "Acton.toml")) {
                missingActonPromptShown = false
                recheck()
            }
        }),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration("ton.acton.path")) {
                missingActonPromptShown = false
                recheck()
            }
        }),
    )

    recheck()
}

async function promptToInstallActonIfNeeded(): Promise<void> {
    if (missingActonPromptShown || missingActonPromptPending || installInProgress) {
        return
    }

    const acton = Acton.getInstance()
    const projectUri = await acton.findWorkspaceProject()
    if (!projectUri) {
        return
    }
    if (await acton.isAvailable(path.dirname(projectUri.fsPath))) {
        return
    }

    missingActonPromptPending = true
    missingActonPromptShown = true

    try {
        const actions = [CONFIGURE_ACTION, DOCS_ACTION]
        if (isInstallerSupported()) {
            actions.unshift(INSTALL_ACTION)
        }

        const selection = await vscode.window.showWarningMessage(
            "This is an Acton project, but the acton executable is not configured or not found.",
            ...actions,
        )

        switch (selection) {
            case INSTALL_ACTION: {
                await installActon(acton, projectUri)
                break
            }
            case CONFIGURE_ACTION: {
                await vscode.commands.executeCommand(
                    "workbench.action.openSettings",
                    "ton.acton.path",
                )
                break
            }
            case DOCS_ACTION: {
                await vscode.env.openExternal(vscode.Uri.parse(INSTALLATION_GUIDE_URL))
                break
            }
            case undefined: {
                break
            }
        }
    } finally {
        missingActonPromptPending = false
    }
}

async function installActon(acton: Acton, projectUri: vscode.Uri): Promise<void> {
    if (installInProgress) {
        void vscode.window.showInformationMessage("Acton installation is already running.")
        return
    }

    installInProgress = true
    const outputChannel = getInstallationOutputChannel()
    outputChannel.clear()
    outputChannel.appendLine("Installing Acton")
    outputChannel.appendLine(`Command: ${INSTALL_COMMAND}`)
    outputChannel.appendLine("")
    outputChannel.show(true)

    try {
        const result = await vscode.window.withProgress(
            {
                cancellable: false,
                location: vscode.ProgressLocation.Notification,
                title: "Installing Acton",
            },
            async progress => {
                progress.report({message: "Downloading and running installer"})
                return runInstaller(outputChannel)
            },
        )

        if (result.error) {
            await showInstallerFailure(
                `Failed to start installer: ${result.error.message}`,
                acton,
                projectUri,
            )
            return
        }

        if (result.exitCode !== 0) {
            const reason =
                firstLine(result.stderr) ??
                firstLine(result.stdout) ??
                (result.signal ? `terminated by ${result.signal}` : `exit code ${result.exitCode}`)
            await showInstallerFailure(`Installer failed: ${reason}`, acton, projectUri)
            return
        }

        if (!(await waitForDefaultInstall(acton))) {
            await showInstallerFailure(
                `Installer finished, but ${acton.getDefaultInstallPath()} was not found or is not executable.`,
                acton,
                projectUri,
            )
            return
        }

        const version = await readActonVersion(acton.getDefaultInstallPath(), outputChannel)
        if (!version) {
            await showInstallerFailure(
                `Installer finished, but ${acton.getDefaultInstallPath()} did not run successfully.`,
                acton,
                projectUri,
            )
            return
        }

        await acton.setConfiguredPath(acton.getDefaultInstallPath(), projectUri)
        missingActonPromptShown = false

        void vscode.window.showInformationMessage(`Acton installed successfully: ${version}`)
    } finally {
        installInProgress = false
    }
}

async function runInstaller(outputChannel: vscode.OutputChannel): Promise<InstallerResult> {
    return new Promise(resolve => {
        const child = child_process.spawn(INSTALL_COMMAND, {
            cwd: os.homedir(),
            env: process.env,
            shell: true,
        })

        let stdout = ""
        let stderr = ""

        child.stdout.on("data", (data: Buffer) => {
            const text = data.toString()
            stdout += text
            outputChannel.append(text)
        })

        child.stderr.on("data", (data: Buffer) => {
            const text = data.toString()
            stderr += text
            outputChannel.append(text)
        })

        child.on("error", (error: Error) => {
            outputChannel.appendLine("")
            outputChannel.appendLine(`Failed to start installer: ${error.message}`)
            resolve({exitCode: null, signal: null, stdout, stderr, error})
        })

        child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
            outputChannel.appendLine("")
            outputChannel.appendLine(
                exitCode === 0
                    ? "Installer finished successfully."
                    : `Installer exited with code ${exitCode ?? "unknown"}.`,
            )
            resolve({exitCode, signal, stdout, stderr})
        })
    })
}

async function waitForDefaultInstall(acton: Acton): Promise<boolean> {
    for (let attempt = 0; attempt < 10; attempt++) {
        if (await acton.isDefaultInstallAvailable()) {
            return true
        }
        await delay(250)
    }

    return false
}

async function readActonVersion(
    actonPath: string,
    outputChannel: vscode.OutputChannel,
): Promise<string | undefined> {
    return new Promise(resolve => {
        const child = child_process.spawn(actonPath, ["--version"])
        let stdout = ""
        let stderr = ""

        child.stdout.on("data", (data: Buffer) => {
            stdout += data.toString()
        })

        child.stderr.on("data", (data: Buffer) => {
            stderr += data.toString()
        })

        child.on("error", (error: Error) => {
            outputChannel.appendLine(`Failed to run ${actonPath} --version: ${error.message}`)
            resolve(undefined)
        })

        child.on("close", (exitCode: number | null) => {
            if (exitCode !== 0) {
                outputChannel.appendLine(`${actonPath} --version exited with code ${exitCode}.`)
                const details = firstLine(stderr) ?? firstLine(stdout)
                if (details) {
                    outputChannel.appendLine(details)
                }
                resolve(undefined)
                return
            }

            resolve(firstLine(stdout) ?? firstLine(stderr) ?? "acton")
        })
    })
}

async function showInstallerFailure(
    message: string,
    acton: Acton,
    projectUri: vscode.Uri,
): Promise<void> {
    missingActonPromptShown = false

    const selection = await vscode.window.showErrorMessage(
        message,
        RETRY_ACTION,
        OPEN_LOG_ACTION,
        CONFIGURE_ACTION,
        DOCS_ACTION,
    )

    switch (selection) {
        case RETRY_ACTION: {
            setTimeout(() => {
                void installActon(acton, projectUri)
            }, 0)
            break
        }
        case OPEN_LOG_ACTION: {
            getInstallationOutputChannel().show()
            break
        }
        case CONFIGURE_ACTION: {
            await vscode.commands.executeCommand("workbench.action.openSettings", "ton.acton.path")
            break
        }
        case DOCS_ACTION: {
            await vscode.env.openExternal(vscode.Uri.parse(INSTALLATION_GUIDE_URL))
            break
        }
        case undefined: {
            break
        }
    }
}

function getInstallationOutputChannel(): vscode.OutputChannel {
    installationOutputChannel ??= vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME)
    return installationOutputChannel
}

function firstLine(text: string): string | undefined {
    const line = text
        .split(/\r?\n/)
        .map(value => value.trim())
        .find(value => value !== "")
    return line
}

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}

function isInstallerSupported(): boolean {
    const architecture = normalizeArchitecture(process.arch)

    if (process.platform === "darwin") {
        return architecture === "ARM64" || architecture === "x86_64"
    }

    if (process.platform === "linux") {
        const supportedArchitecture = architecture === "ARM64" || architecture === "x86_64"
        return supportedArchitecture && isGnuLinux(architecture)
    }

    return false
}

function normalizeArchitecture(architecture: string): string {
    switch (architecture.toLowerCase()) {
        case "aarch64":
        case "arm64": {
            return "ARM64"
        }
        case "x86_64":
        case "amd64":
        case "x64": {
            return "x86_64"
        }
        default: {
            return architecture
        }
    }
}

function isGnuLinux(architecture: string): boolean {
    const loaderCandidates =
        architecture === "x86_64"
            ? [
                  "/lib64/ld-linux-x86-64.so.2",
                  "/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2",
                  "/usr/lib64/ld-linux-x86-64.so.2",
              ]
            : architecture === "ARM64"
              ? [
                    "/lib/ld-linux-aarch64.so.1",
                    "/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1",
                    "/usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1",
                ]
              : []

    if (loaderCandidates.length === 0) {
        return false
    }

    return loaderCandidates.some(candidate => existsSync(candidate))
}
