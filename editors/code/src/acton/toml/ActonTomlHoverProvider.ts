//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as vscode from "vscode"

export class ActonTomlHoverProvider implements vscode.HoverProvider {
    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): vscode.Hover | null {
        if (!document.fileName.endsWith("Acton.toml")) {
            return null
        }

        const line = document.lineAt(position.line).text
        const text = document.getText()
        const lines = text.split(/\r?\n/)

        let currentSection: string | null = null
        for (let i = 0; i <= position.line; i++) {
            const l = lines[i].trim()
            if (l.startsWith("[") && l.endsWith("]")) {
                currentSection = l.slice(1, -1).trim()
            }
        }

        if (currentSection !== "scripts") {
            return null
        }

        const scriptMatch = /^([^\s#=]+)\s*=/.exec(line)
        if (scriptMatch) {
            const scriptName = scriptMatch[1]
            const scriptNameStart = line.indexOf(scriptName)
            const scriptNameEnd = scriptNameStart + scriptName.length

            if (position.character >= scriptNameStart && position.character <= scriptNameEnd) {
                const args = [document.uri.fsPath, scriptName]
                const commandUri = vscode.Uri.parse(
                    `command:ton.acton.runScript?${encodeURIComponent(JSON.stringify(args))}`,
                )
                const contents = new vscode.MarkdownString(`[Run Script](${commandUri.toString()})`)
                contents.isTrusted = true
                return new vscode.Hover(contents)
            }
        }

        return null
    }
}
