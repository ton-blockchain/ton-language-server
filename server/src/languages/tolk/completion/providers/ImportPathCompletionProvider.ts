//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {AsyncCompletionProvider} from "@server/languages/tolk/completion/CompletionProvider"
import {CompletionItemKind} from "vscode-languageserver-types"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {
    CompletionResult,
    CompletionWeight,
} from "@server/languages/tolk/completion/WeightedCompletionItem"
import * as path from "node:path"
import {globalVFS} from "@server/vfs/global"
import {listDirs, listFiles} from "@server/vfs/vfs"
import {filePathToUri} from "@server/files"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {trimSuffix} from "@server/utils/strings"
import {projectTolkStdlibPath} from "@server/languages/tolk/toolchain/toolchain"

export class ImportPathCompletionProvider implements AsyncCompletionProvider {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.insideImport
    }

    public async addCompletion(ctx: CompletionContext, result: CompletionResult): Promise<void> {
        const file = ctx.element.file
        const currentDir = path.dirname(file.path)

        const importPath = trimSuffix(ctx.element.node.text.slice(1, -1), "DummyIdentifier")

        if (importPath.startsWith("@stdlib/") && projectTolkStdlibPath) {
            await this.addEntries(projectTolkStdlibPath + "/", file, "", result)
            return
        }

        if (importPath.startsWith("./") || importPath.startsWith("../")) {
            const targetDir = path.join(currentDir, importPath)
            await this.addEntries(targetDir, file, "", result)
            return
        }

        // On empty path:
        // import "<caret>"
        // or on path without ./
        // import "foo/<caret>"
        await this.addEntries(path.join(currentDir, importPath) + "/", file, "", result)

        if (importPath === "") {
            result.add({
                label: "@stdlib/",
                kind: CompletionItemKind.Folder,
                weight: CompletionWeight.CONTEXT_ELEMENT,
            })
        }
    }

    private async addEntries(
        dir: string,
        file: TolkFile,
        prefix: string,
        result: CompletionResult,
    ): Promise<void> {
        const [actualDir, namePrefix] = this.splitPath(dir)

        const files = await this.files(actualDir, file)
        for (const name of files) {
            if (!name.startsWith(namePrefix)) {
                // for "./bar/some"
                // filter all files that do not start with `some`
                continue
            }

            const actualInsertName = namePrefix === "" ? `${prefix}${name}` : name
            this.addFile(actualInsertName, result)
        }

        const dirs = await this.dirs(actualDir)
        for (const name of dirs) {
            if (!name.startsWith(namePrefix)) {
                // for "./bar/some"
                // filter all dirs that do not start with `some`
                continue
            }

            result.add({
                label: name + "/",
                kind: CompletionItemKind.Folder,
                weight: CompletionWeight.CONTEXT_ELEMENT,
            })
        }
    }

    private splitPath(path: string): [string, string] {
        if (path.endsWith("/") || path.endsWith("\\")) {
            // import "./foo/"
            return [path, ""]
        }

        const lastSlash = path.lastIndexOf("/")
        if (lastSlash === -1) {
            const lastBackSlash = path.lastIndexOf("\\")
            if (lastBackSlash === -1) {
                return [path, ""]
            }

            const dir = path.slice(0, lastBackSlash)
            const name = path.slice(lastBackSlash + 1)

            return [dir, name]
        }

        const dir = path.slice(0, lastSlash)
        const name = path.slice(lastSlash + 1)

        return [dir, name]
    }

    private addFile(name: string, result: CompletionResult): void {
        result.add({
            label: name,
            kind: CompletionItemKind.File,
            labelDetails: {
                detail: ".tolk",
            },
            weight: CompletionWeight.CONTEXT_ELEMENT,
        })
    }

    private async files(dir: string, currentFile: TolkFile): Promise<string[]> {
        try {
            const allFiles = await listFiles(globalVFS, filePathToUri(dir))
            return allFiles
                .filter(file => file.endsWith(".tolk"))
                .map(file => path.basename(file, ".tolk"))
                .filter(name => name !== currentFile.name)
        } catch {
            return []
        }
    }

    private async dirs(dir: string): Promise<string[]> {
        try {
            return await listDirs(globalVFS, filePathToUri(dir))
        } catch {
            return []
        }
    }
}
