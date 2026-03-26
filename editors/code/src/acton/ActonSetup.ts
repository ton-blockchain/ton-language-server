//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as path from "node:path"
import {existsSync} from "node:fs"

import * as vscode from "vscode"

import {Acton} from "./Acton"

const INSTALLATION_GUIDE_URL = "https://i582.github.io/acton/docs/installation/"
const INSTALL_COMMAND =
    "curl --proto '=https' --tlsv1.2 -LsSf https://github.com/i582/acton-public/releases/latest/download/acton-installer.sh | sh"
const INSTALL_ACTION = "Install Acton"
const CONFIGURE_ACTION = "Configure Path"
const DOCS_ACTION = "Open Installation Guide"

let missingActonPromptShown = false
let missingActonPromptPending = false

export function registerActonSetupNotifications(context: vscode.ExtensionContext): void {
    const recheck = (): void => {
        void promptToInstallActonIfNeeded()
    }

    context.subscriptions.push(
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
    if (missingActonPromptShown || missingActonPromptPending) {
        return
    }

    const acton = Acton.getInstance()
    await acton.syncConfiguredPath()

    if (!(await acton.hasWorkspaceProject())) {
        return
    }
    if (await acton.isAvailable()) {
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
                await acton.setConfiguredPath(acton.getDefaultInstallPath())
                runInstaller()
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

function runInstaller(): void {
    const terminal =
        vscode.window.terminals.find(t => t.name === "Acton Installation") ??
        vscode.window.createTerminal("Acton Installation")

    terminal.show()
    terminal.sendText(INSTALL_COMMAND)
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
