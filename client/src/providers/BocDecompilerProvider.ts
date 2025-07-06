//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import * as tasm from "ton-assembly-test-dev"

export class BocDecompilerProvider implements vscode.TextDocumentContentProvider {
    private readonly _onDidChange: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter()
    public readonly onDidChange: vscode.Event<vscode.Uri> = this._onDidChange.event

    private readonly lastModified: Map<vscode.Uri, Date> = new Map()

    public static scheme: string = "boc-decompiled"

    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const bocUri = this.getBocPath(uri)

        try {
            return await this.decompileBoc(bocUri)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            return this.formatError(errorMessage)
        }
    }

    private getBocPath(uri: vscode.Uri): vscode.Uri {
        console.log("Original URI:", uri.toString())
        const bocPath = uri.fsPath.replace(".decompiled.tasm", "")
        console.log("BoC path:", bocPath)
        return vscode.Uri.file(bocPath)
    }

    private async decompileBoc(bocUri: vscode.Uri): Promise<string> {
        try {
            const rawContent = await vscode.workspace.fs.readFile(bocUri)
            const content = Buffer.from(rawContent).toString("base64")
            const cell = tasm.Cell.fromBase64(content)
            const instructions = tasm.runtime.decompileCell(cell)

            const output = tasm.text.print(instructions)

            return this.formatDecompiledOutput(output, bocUri)
        } catch (error: unknown) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            throw new Error(`Decompilation failed: ${error}`)
        }
    }

    private formatDecompiledOutput(output: string, bocUri: vscode.Uri): string {
        const header = [
            "// Decompiled BoC file",
            "// Note: This is auto-generated code",
            `// Time: ${new Date().toISOString()}`,
            `// Source: ${bocUri.fsPath}`,
            "",
            "",
        ].join("\n")

        return header + output
    }

    private formatError(error: string): string {
        return [
            "// Failed to decompile BoC file",
            "// Error: " + error,
            "// Time: " + new Date().toISOString(),
        ].join("\n")
    }

    public update(uri: vscode.Uri): void {
        const bocUri = this.getBocPath(uri)
        this.lastModified.set(bocUri, new Date())
        this._onDidChange.fire(uri)
    }
}
