//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"
import * as path from "node:path"
import type {TolkFile} from "./TolkFile"
import {trimPrefix, trimSuffix} from "@server/utils/strings"
import {projectTolkStdlibPath} from "@server/languages/tolk/toolchain/toolchain"
import {filePathToUri, TOLK_PARSED_FILES_CACHE} from "@server/files"

export class ImportResolver {
    public static resolveImport(fromFile: TolkFile, importPath: string): string | null {
        if (importPath.startsWith("@stdlib/")) {
            return this.resolveStdlibPath(importPath)
        }

        if (importPath.startsWith("./") || importPath.startsWith("../")) {
            return this.resolveLocalPath(fromFile, importPath)
        }

        // resolve `import "foo.tolk"` as local as well
        return this.resolveLocalPath(fromFile, importPath)
    }

    private static resolveLocalPath(file: TolkFile, localPath: string): string | null {
        const withoutExt = trimSuffix(localPath, ".tolk")
        const dir = path.dirname(file.path)
        return path.join(dir, withoutExt) + ".tolk"
    }

    private static resolveStdlibPath(prefixedPath: string): string | null {
        const stdlibPath = projectTolkStdlibPath
        if (!stdlibPath) return null

        const withoutExt = trimSuffix(prefixedPath, ".tolk")
        const importPath = trimPrefix(withoutExt, "@stdlib/")
        return path.join(stdlibPath, importPath) + ".tolk"
    }

    public static toFile(targetPath: string): TolkFile | null {
        const targetUri = filePathToUri(targetPath)
        return TOLK_PARSED_FILES_CACHE.get(targetUri) ?? null
    }

    public static resolveAsFile(file: TolkFile, pathNode: SyntaxNode): TolkFile | null {
        const targetPath = this.resolveImport(file, pathNode.text.slice(1, -1))
        if (!targetPath) return null
        return this.toFile(targetPath)
    }

    public static resolveNode(file: TolkFile, pathNode: SyntaxNode): string | null {
        return this.resolveImport(file, pathNode.text.slice(1, -1))
    }
}
