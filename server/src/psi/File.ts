//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import * as path from "node:path"
import type {Node as SyntaxNode, Tree} from "web-tree-sitter"
import {fileURLToPath} from "node:url"

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
        return fileURLToPath(this.uri)
    }

    public get name(): string {
        return path.basename(this.path, ".tolk")
    }
}
