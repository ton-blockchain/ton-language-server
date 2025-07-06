//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {glob} from "glob"
import {index} from "@server/languages/tolk/indexes"
import {fileURLToPath} from "node:url"
import * as path from "node:path"
import {filePathToUri, findTolkFile} from "@server/files"

export enum TolkIndexingRootKind {
    Stdlib = "stdlib",
    Workspace = "workspace",
}

export class TolkIndexingRoot {
    public constructor(
        public root: string,
        public kind: TolkIndexingRootKind,
    ) {}

    public async index(): Promise<void> {
        const ignore =
            this.kind === TolkIndexingRootKind.Stdlib
                ? []
                : [
                      ".git/**",
                      "allure-results/**",
                      "**/node_modules/**",
                      "**/dist/**",
                      "**/__testdata/**",
                  ]

        const rootDir = fileURLToPath(this.root)
        const files = await glob("**/*.tolk", {
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
            const file = await findTolkFile(uri)
            index.addFile(uri, file, false)
        }
    }
}
