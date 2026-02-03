//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as path from "node:path"

import {fileURLToPath} from "node:url"

import type {Node as SyntaxNode, Tree} from "web-tree-sitter"

export class File {
    public constructor(
        public readonly uri: string,
        public readonly tree: Tree,
        public readonly content: string,
    ) {}

    public get rootNode(): SyntaxNode {
        return this.tree.rootNode
    }

    public get path(): string {
        if (this.uri.startsWith("file:")) {
            return fileURLToPath(this.uri)
        }
        return this.uri
    }

    public get fsPath(): string {
        return this.path
    }

    public get name(): string {
        return path.basename(this.path, ".tolk")
    }
}
