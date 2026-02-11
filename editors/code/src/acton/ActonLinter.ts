//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as vscode from "vscode"

import {Acton} from "./Acton"
import {CheckCommand} from "./ActonCommand"

interface ActonRange {
    readonly start: {readonly line: number; readonly character: number}
    readonly end: {readonly line: number; readonly character: number}
}

interface ActonAnnotation {
    readonly range: ActonRange
    readonly message?: string
    readonly is_primary: boolean
    readonly tags?: string[]
}

interface ActonEdit {
    readonly range: ActonRange
    readonly newText: string
    readonly file: string
}

interface ActonFix {
    readonly message: string
    readonly edits: readonly ActonEdit[]
    readonly applicability: "auto" | "manual"
}

interface ActonDiagnostic {
    readonly file: string
    readonly severity: "error" | "warning" | "info"
    readonly name: string
    readonly code?: string
    readonly message: string
    readonly annotations: readonly ActonAnnotation[]
    readonly fixes: readonly ActonFix[]
    readonly source: string
}

interface ActonCheckOutput {
    readonly success: boolean
    readonly diagnostics: readonly ActonDiagnostic[]
}

export class ActonLinter implements vscode.CodeActionProvider {
    private readonly diagnosticCollection: vscode.DiagnosticCollection
    private debounceTimer: NodeJS.Timeout | undefined
    private readonly disposables: vscode.Disposable[] = []
    private latestDiagnostics: readonly ActonDiagnostic[] = []

    public constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection("acton")

        this.disposables.push(
            vscode.languages.registerCodeActionsProvider("tolk", this, {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
            }),
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.languageId === "tolk") {
                    this.triggerCheck()
                }
            }),
            vscode.workspace.onDidOpenTextDocument(doc => {
                if (doc.languageId === "tolk") {
                    this.triggerCheck()
                }
            }),
            vscode.workspace.onDidSaveTextDocument(doc => {
                if (doc.languageId === "tolk") {
                    this.triggerCheck()
                }
            }),
            vscode.workspace.onDidCloseTextDocument(doc => {
                this.diagnosticCollection.delete(doc.uri)
            }),
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration("ton.acton.linter")) {
                    this.triggerCheck()
                }
            }),
        )

        this.triggerCheck()
    }

    public dispose(): void {
        this.diagnosticCollection.clear()
        this.diagnosticCollection.dispose()
        this.disposables.forEach(d => {
            d.dispose()
        })
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
        }
    }

    private triggerCheck(): void {
        const config = vscode.workspace.getConfiguration("ton.acton.linter")
        const enabled = config.get<boolean>("enabled", true)

        if (!enabled) {
            this.diagnosticCollection.clear()
            return
        }

        const debounceMs = config.get<number>("debounce", 500)

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
        }

        this.debounceTimer = setTimeout(() => {
            void this.runCheck()
        }, debounceMs)
    }

    private async runCheck(): Promise<void> {
        const acton = Acton.getInstance()

        // We want to run check even if no editor is active,
        // but we need a starting point to find Acton.toml
        const activeUri =
            vscode.window.activeTextEditor?.document.uri ??
            vscode.workspace.workspaceFolders?.[0]?.uri

        if (!activeUri) {
            return
        }

        const tomlUri = await acton.findActonToml(activeUri)
        if (!tomlUri) {
            return
        }

        const workingDirectory = vscode.Uri.joinPath(tomlUri, "..").fsPath
        const command = new CheckCommand(true)

        try {
            const {stdout, stderr, exitCode} = await acton.spawn(command, workingDirectory)

            if (exitCode !== 0 && stdout.trim() === "") {
                console.error("Acton check failed", stderr)
                return
            }

            if (stdout.trim() === "") {
                this.diagnosticCollection.clear()
                return
            }

            let output: ActonCheckOutput
            try {
                output = JSON.parse(stdout) as ActonCheckOutput
            } catch (error) {
                console.error("Failed to parse acton check output", error, stdout, stderr)
                return
            }

            this.latestDiagnostics = output.diagnostics
            this.processDiagnostics(output)
        } catch (error) {
            console.error("Failed to run acton check", error)
        }
    }

    public provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = []

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== "acton" || !diagnostic.code) {
                continue
            }

            // Find the original acton diagnostic
            const actonDiag = this.latestDiagnostics.find(d => {
                const message = d.code ? `[${d.code}] ${d.message}` : d.message
                if (d.code !== (diagnostic.code as string) || message !== diagnostic.message) {
                    return false
                }
                // Check if file matches
                try {
                    return vscode.Uri.file(d.file).toString() === document.uri.toString()
                } catch {
                    return false
                }
            })

            if (actonDiag?.fixes) {
                for (const fix of actonDiag.fixes) {
                    const action = new vscode.CodeAction(
                        fix.message,
                        vscode.CodeActionKind.QuickFix,
                    )
                    action.diagnostics = [diagnostic]
                    action.edit = new vscode.WorkspaceEdit()

                    for (const edit of fix.edits) {
                        const editRange = new vscode.Range(
                            edit.range.start.line,
                            edit.range.start.character,
                            edit.range.end.line,
                            edit.range.end.character,
                        )
                        action.edit.replace(vscode.Uri.file(edit.file), editRange, edit.newText)
                    }

                    if (fix.applicability === "auto") {
                        action.isPreferred = true
                    }

                    actions.push(action)
                }
            }
        }

        return actions
    }

    private processDiagnostics(output: ActonCheckOutput): void {
        const diagnosticsByFile: Map<string, vscode.Diagnostic[]> = new Map()

        for (const diag of output.diagnostics) {
            const severity = this.mapSeverity(diag.severity)
            const primaryAnnotation =
                diag.annotations.find(a => a.is_primary) ?? diag.annotations.at(0)

            if (!primaryAnnotation) continue

            const range = new vscode.Range(
                primaryAnnotation.range.start.line,
                primaryAnnotation.range.start.character,
                primaryAnnotation.range.end.line,
                primaryAnnotation.range.end.character,
            )

            const message = diag.code ? `[${diag.code}] ${diag.message}` : diag.message
            const diagnostic = new vscode.Diagnostic(range, message, severity)
            diagnostic.source = "acton"
            diagnostic.code = diag.code

            // Tags
            const tags: vscode.DiagnosticTag[] = []
            diag.annotations.forEach(a => {
                a.tags?.forEach(tag => {
                    if (tag === "Unnecessary") tags.push(vscode.DiagnosticTag.Unnecessary)
                    if (tag === "Deprecated") tags.push(vscode.DiagnosticTag.Deprecated)
                })
            })
            if (tags.length > 0) {
                diagnostic.tags = tags
            }

            // Related information
            const relatedInformation: vscode.DiagnosticRelatedInformation[] = []
            for (const annotation of diag.annotations) {
                if (annotation === primaryAnnotation && !annotation.message) continue

                const relatedRange = new vscode.Range(
                    annotation.range.start.line,
                    annotation.range.start.character,
                    annotation.range.end.line,
                    annotation.range.end.character,
                )

                relatedInformation.push(
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(vscode.Uri.file(diag.file), relatedRange),
                        annotation.message ?? (annotation.is_primary ? "here" : "related context"),
                    ),
                )
            }
            if (relatedInformation.length > 0) {
                diagnostic.relatedInformation = relatedInformation
            }

            const fileDiagnostics = diagnosticsByFile.get(diag.file) ?? []
            fileDiagnostics.push(diagnostic)
            diagnosticsByFile.set(diag.file, fileDiagnostics)
        }

        // Update diagnostic collection
        this.diagnosticCollection.clear()
        for (const [file, fileDiagnostics] of diagnosticsByFile) {
            this.diagnosticCollection.set(vscode.Uri.file(file), fileDiagnostics)
        }
    }

    private mapSeverity(severity: string): vscode.DiagnosticSeverity {
        switch (severity) {
            case "error": {
                return vscode.DiagnosticSeverity.Error
            }
            case "warning": {
                return vscode.DiagnosticSeverity.Warning
            }
            case "info": {
                return vscode.DiagnosticSeverity.Information
            }
            default: {
                return vscode.DiagnosticSeverity.Information
            }
        }
    }
}
