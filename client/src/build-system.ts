//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"

interface TaskProviderBase extends vscode.TaskProvider {
    createTask(): vscode.Task

    isAvailable(): Promise<boolean>

    readonly taskType: string
}

export class BlueprintTaskProvider implements TaskProviderBase {
    public readonly taskType: string
    public readonly name: string
    public readonly command: string
    public readonly group: vscode.TaskGroup

    public constructor(id: string, name: string, command: string, group: vscode.TaskGroup) {
        this.taskType = `blueprint-${id}`
        this.name = name
        this.command = command
        this.group = group
    }

    public async provideTasks(): Promise<vscode.Task[]> {
        const isAvailable = await this.isAvailable()
        if (!isAvailable) return []
        return [this.createTask()]
    }

    public async isAvailable(): Promise<boolean> {
        return projectUsesBlueprint()
    }

    public resolveTask(task: vscode.Task): vscode.Task | undefined {
        const def = task.definition
        if (def.type === this.taskType) {
            return this.createTask()
        }
        return undefined
    }

    public createTask(): vscode.Task {
        const definition: vscode.TaskDefinition = {
            type: this.taskType,
        }

        const execution = new vscode.ShellExecution(this.command)
        const task = new vscode.Task(
            definition,
            vscode.TaskScope.Workspace,
            this.name,
            "Blueprint",
            execution,
        )

        task.group = this.group
        task.presentationOptions = {
            reveal: vscode.TaskRevealKind.Always,
            panel: vscode.TaskPanelKind.Dedicated,
            focus: true,
        }

        return task
    }
}

async function registerTaskProvider(
    context: vscode.ExtensionContext,
    provider: TaskProviderBase,
): Promise<void> {
    if (!(await provider.isAvailable())) return

    const taskProviderDisposable = vscode.tasks.registerTaskProvider(provider.taskType, provider)
    context.subscriptions.push(taskProviderDisposable)
}

export async function registerBuildTasks(context: vscode.ExtensionContext): Promise<void> {
    await registerTaskProvider(
        context,
        new BlueprintTaskProvider("build", "build", "npx blueprint build", vscode.TaskGroup.Build),
    )
    await registerTaskProvider(
        context,
        new BlueprintTaskProvider(
            "build-all",
            "build all contracts",
            "npx blueprint build --all",
            vscode.TaskGroup.Build,
        ),
    )
    await registerTaskProvider(
        context,
        new BlueprintTaskProvider("test", "test", "npx blueprint test", vscode.TaskGroup.Test),
    )
    await registerTaskProvider(
        context,
        new BlueprintTaskProvider(
            "build-and-test-all",
            "build and test all contracts",
            "npx blueprint build --all && npx blueprint test",
            vscode.TaskGroup.Build,
        ),
    )

    context.subscriptions.push(
        vscode.commands.registerCommand("tolk.build", async () => {
            const tasks = await vscode.tasks.fetchTasks()

            const buildTask = tasks.find(
                task => task.group === vscode.TaskGroup.Build && task.source === "Blueprint",
            )

            if (buildTask) {
                await vscode.tasks.executeTask(buildTask)
            } else {
                void vscode.window.showErrorMessage("Build task not found")
            }
        }),
    )
}

async function projectUsesBlueprint(): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) return false

    try {
        const packageJsonContent = await vscode.workspace.fs.readFile(
            vscode.Uri.joinPath(workspaceFolders[0].uri, "package.json"),
        )
        const packageJson = JSON.parse(new TextDecoder().decode(packageJsonContent)) as {
            dependencies?: Record<string, unknown>
            devDependencies?: Record<string, unknown>
        }
        return (
            packageJson.dependencies?.["@ton/blueprint"] !== undefined ||
            packageJson.devDependencies?.["@ton/blueprint"] !== undefined
        )
    } catch {
        // ignore any errors
    }

    return false
}
