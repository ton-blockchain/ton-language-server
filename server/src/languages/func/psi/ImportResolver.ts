//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as path from "node:path"

import type {Node as SyntaxNode} from "web-tree-sitter"

import {filePathToUri, FUNC_PARSED_FILES_CACHE} from "@server/files"

import type {FuncFile} from "./FuncFile"

export class ImportResolver {
    public static resolveImport(fromFile: FuncFile, importPath: string): string | null {
        if (importPath.startsWith("./") || importPath.startsWith("../")) {
            return this.resolveLocalPath(fromFile, importPath)
        }

        // resolve `#include "foo.fc"` as local as well
        return this.resolveLocalPath(fromFile, importPath)
    }

    private static resolveLocalPath(file: FuncFile, localPath: string): string | null {
        const dir = path.dirname(file.path)
        return path.join(dir, localPath)
    }

    public static toFile(targetPath: string): FuncFile | null {
        const targetUri = filePathToUri(targetPath)
        return FUNC_PARSED_FILES_CACHE.get(targetUri) ?? null
    }

    public static resolveAsFile(file: FuncFile, pathNode: SyntaxNode): FuncFile | null {
        const targetPath = this.resolveImport(file, pathNode.text.slice(1, -1))
        if (!targetPath) return null
        return this.toFile(targetPath)
    }

    public static resolveNode(file: FuncFile, pathNode: SyntaxNode): string | null {
        return this.resolveImport(file, pathNode.text.slice(1, -1))
    }
}
