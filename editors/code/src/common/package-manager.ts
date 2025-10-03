import vscode from "vscode"

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun"

export async function detectPackageManager(
    workspaceFolder: vscode.WorkspaceFolder,
): Promise<PackageManager> {
    try {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceFolder.uri, "yarn.lock"))
        return "yarn"
    } catch {}

    try {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceFolder.uri, "pnpm-lock.yaml"))
        return "pnpm"
    } catch {}

    try {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceFolder.uri, "bun.lockb"))
        return "bun"
    } catch {}

    return "npm"
}

export function getInstallCommand(packageManager: PackageManager, packageName: string): string {
    switch (packageManager) {
        case "yarn": {
            return `yarn add --dev ${packageName}`
        }
        case "pnpm": {
            return `pnpm add --save-dev ${packageName}`
        }
        case "bun": {
            return `bun add --dev ${packageName}`
        }
        case "npm": {
            return `npm install --save-dev ${packageName}`
        }
    }

    throw new Error(`Unsupported package manager`)
}

export async function getLocalBinaryPath(binaryName: string): Promise<string | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) {
        return null
    }

    try {
        const nodeModulesPath = vscode.Uri.joinPath(
            workspaceFolder.uri,
            "node_modules",
            ".bin",
            binaryName,
        )
        await vscode.workspace.fs.stat(nodeModulesPath)
        return nodeModulesPath.fsPath
    } catch {
        return null
    }
}
