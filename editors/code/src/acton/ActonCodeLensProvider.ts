import * as vscode from "vscode"

export class ActonCodeLensProvider implements vscode.CodeLensProvider {
    public provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken,
    ): vscode.CodeLens[] {
        if (document.languageId !== "tolk") {
            return []
        }

        const text = document.getText()
        const mainRegex = /fun\s+main\s*\(/g
        const lenses: vscode.CodeLens[] = []
        let match: {index: number} | null

        while ((match = mainRegex.exec(text)) !== null) {
            const line = document.positionAt(match.index).line
            const range = new vscode.Range(line, 0, line, 0)

            lenses.push(
                new vscode.CodeLens(range, {
                    title: "$(play) Run",
                    command: "acton.run",
                    arguments: [document.uri.fsPath],
                }),
                new vscode.CodeLens(range, {
                    title: "with broadcast",
                    command: "acton.runBroadcast",
                    arguments: [document.uri.fsPath],
                }),
            )
        }

        return lenses
    }
}
