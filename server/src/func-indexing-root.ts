//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as path from "node:path"
import {glob} from "glob"
import {index} from "@server/languages/func/indexes"
import {fileURLToPath} from "node:url"
import {filePathToUri, findFuncFile} from "@server/files"

export enum FuncIndexingRootKind {
    Stdlib = "stdlib",
    Workspace = "workspace",
}

export class FuncIndexingRoot {
    public constructor(
        public root: string,
        public kind: FuncIndexingRootKind,
    ) {}

    public async index(): Promise<void> {
        const ignore =
            this.kind === FuncIndexingRootKind.Stdlib
                ? []
                : [
                      ".git/**",
                      "allure-results/**",
                      "**/node_modules/**",
                      "**/dist/**",
                      "**/__testdata/**",
                  ]

        const rootDir = fileURLToPath(this.root)
        const files = await glob("**/*.{fc,func}", {
            cwd: rootDir,
            ignore: ignore,
        })
        if (files.length === 0) {
            console.warn(`No file to index in ${this.root}`)
        }
        for (const filePath of files) {
            console.info("Indexing:", filePath)
            const absPath = path.join(rootDir, filePath)
            const uri = filePathToUri(absPath)
            const file = await findFuncFile(uri)
            index.addFile(uri, file, false)
        }
    }
}
