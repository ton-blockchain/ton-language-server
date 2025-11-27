import {fileURLToPath} from "node:url"

import * as path from "node:path"

import * as fs from "node:fs"

import {glob} from "glob"

import {filePathToUri} from "@server/files"
import {showErrorMessage} from "@server/utils/notify"

export enum IndexingRootKind {
    Stdlib = "stdlib",
    Workspace = "workspace",
}

export abstract class IndexingRoot {
    protected constructor(
        public root: string,
        public extensions: string[],
        public kind: IndexingRootKind,
    ) {}

    public async index(): Promise<void> {
        const ignore =
            this.kind === IndexingRootKind.Stdlib
                ? []
                : [
                      ".git/**",
                      "allure-results/**",
                      "**/node_modules/**",
                      "**/dist/**",
                      "**/__testdata/**",
                  ]

        const rootDir = fileURLToPath(this.root)

        const globPattern =
            this.extensions.length === 1 ? this.extensions[0] : `{${this.extensions.join(",")}}`

        const files = await glob(`**/*.${globPattern}`, {
            cwd: rootDir,
            ignore: ignore,
        })
        if (files.length === 0) {
            if (!this.checkReadAccess(this.root)) {
                const message = `Can't access the '${this.root}' folder in the Tolk standard library.\n`

                showErrorMessage(message)
                console.error(message)
            }

            console.warn(`No file to index in ${this.root}`)
        }
        for (const filePath of files) {
            console.info("Indexing:", filePath)
            const absPath = path.join(rootDir, filePath)
            const uri = filePathToUri(absPath)
            await this.onFile(uri)
        }
    }

    private checkReadAccess(path: string): boolean {
        try {
            fs.accessSync(path, fs.constants.R_OK)
            return true
        } catch {
            return false
        }
    }

    protected abstract onFile(uri: string): Promise<void>
}
