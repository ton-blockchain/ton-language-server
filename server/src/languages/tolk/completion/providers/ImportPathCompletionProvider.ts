//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as path from "node:path"
import * as fs from "node:fs"

import {CompletionItemKind} from "vscode-languageserver-types"

import {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"

import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {trimSuffix} from "@server/utils/strings"
import {projectTolkStdlibPath} from "@server/languages/tolk/toolchain/toolchain"
import {ActonToml} from "@server/acton/ActonToml"

export class ImportPathCompletionProvider implements CompletionProvider<CompletionContext> {
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.insideImport
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        const file = ctx.element.file
        const currentDir = path.dirname(file.fsPath)

        const importPath = trimSuffix(ctx.element.node.text.slice(1, -1), "DummyIdentifier")

        if (importPath.startsWith("@stdlib/") && projectTolkStdlibPath) {
            this.addEntries(projectTolkStdlibPath + "/", file, "", result)
            return
        }

        const actonToml = ActonToml.discover(file.uri)
        if (importPath.startsWith("@") && actonToml) {
            const mappings = actonToml.getMappings()
            for (const [key, value] of mappings.entries()) {
                if (importPath.startsWith(`@${key}/`)) {
                    const mappingDir = path.resolve(actonToml.workingDir, value)
                    const subPath = importPath.slice(key.length + 2)
                    const normalizedSubPath = subPath.length === 0 ? "/" : subPath
                    this.addEntries(path.join(mappingDir, normalizedSubPath), file, "", result)
                    return
                }
            }
        }

        if (importPath.startsWith("./") || importPath.startsWith("../")) {
            const targetDir = path.join(currentDir, importPath)
            this.addEntries(targetDir, file, "", result)
            return
        }

        // On empty path:
        // import "<caret>"
        // or on path without ./
        // import "foo/<caret>"
        this.addEntries(path.join(currentDir, importPath) + "/", file, "", result)

        if (importPath === "" || importPath === "@") {
            result.add({
                label: "@stdlib/",
                kind: CompletionItemKind.Folder,
                weight: CompletionWeight.CONTEXT_ELEMENT,
            })

            if (actonToml) {
                const mappings = actonToml.getMappings()
                for (const key of mappings.keys()) {
                    result.add({
                        label: `@${key}/`,
                        kind: CompletionItemKind.Folder,
                        weight: CompletionWeight.CONTEXT_ELEMENT,
                    })
                }
            }
        }
    }

    private addEntries(
        dir: string,
        file: TolkFile,
        prefix: string,
        result: CompletionResult,
    ): void {
        const [actualDir, namePrefix] = this.splitPath(dir)

        const files = this.files(actualDir, file)
        for (const name of files) {
            if (namePrefix && !name.startsWith(namePrefix)) {
                // for "./bar/some"
                // filter all files that do not start with `some`
                continue
            }

            const actualInsertName = namePrefix === "" ? `${prefix}${name}` : name
            this.addFile(actualInsertName, result)
        }

        const dirs = this.dirs(actualDir)
        for (const name of dirs) {
            if (namePrefix && !name.startsWith(namePrefix)) {
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

    private files(dir: string, currentFile: TolkFile): string[] {
        try {
            return fs
                .readdirSync(dir, {withFileTypes: true})
                .filter(dirent => dirent.isFile() && dirent.name.endsWith(".tolk"))
                .map(dirent => path.basename(dirent.name, ".tolk"))
                .filter(name => name !== currentFile.name)
        } catch {
            return []
        }
    }

    private dirs(dir: string): string[] {
        try {
            return fs
                .readdirSync(dir, {withFileTypes: true})
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name)
        } catch {
            return []
        }
    }
}
