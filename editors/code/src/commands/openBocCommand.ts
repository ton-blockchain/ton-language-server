//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as vscode from "vscode"
import {BocDecompilerProvider} from "../providers/BocDecompilerProvider"
import {openBocFilePicker} from "./saveBocDecompiledCommand"
import {Disposable} from "vscode"

export function registerOpenBocCommand(_context: vscode.ExtensionContext): Disposable {
    return vscode.commands.registerCommand(
        "ton.openBocFile",
        async (fileUri: vscode.Uri | undefined) => {
            try {
                const actualFileUri = fileUri ?? (await openBocFilePicker())
                if (actualFileUri === undefined) return

                const decompileUri = actualFileUri.with({
                    scheme: BocDecompilerProvider.scheme,
                    path: actualFileUri.path + ".decompiled.tasm",
                })

                const doc = await vscode.workspace.openTextDocument(decompileUri)
                await vscode.window.showTextDocument(doc, {
                    preview: true,
                    viewColumn: vscode.ViewColumn.Active,
                })
            } catch (error: unknown) {
                console.error("Error in openBocCommand:", error)
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                vscode.window.showErrorMessage(`Failed to open BoC file: ${error}`)
            }
        },
    )
}
