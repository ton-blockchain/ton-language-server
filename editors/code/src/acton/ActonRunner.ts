import * as vscode from "vscode"

export class ActonRunner {
    private terminal: vscode.Terminal | undefined

    public run(scriptPath: string, broadcast: boolean = false): void {
        const binaryPath = this.getBinaryPath()
        const command = `${binaryPath} script "${scriptPath}"${broadcast ? " --broadcast" : ""}`

        const terminal = this.getTerminal()
        terminal.show()
        terminal.sendText(command)
    }

    private getBinaryPath(): string {
        const config = vscode.workspace.getConfiguration("ton")
        const binaryPath = config.get<string>("acton.binaryPath")
        if (binaryPath == undefined || binaryPath.length === 0) {
            return "acton"
        }
        return binaryPath
    }

    private getTerminal(): vscode.Terminal {
        if (!this.terminal || this.terminal.exitStatus !== undefined) {
            this.terminal = vscode.window.createTerminal("Acton")
        }
        return this.terminal
    }
}

export const actonRunner = new ActonRunner()
