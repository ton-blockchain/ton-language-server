//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as path from "node:path"

import type {Node as SyntaxNode} from "web-tree-sitter"

import {trimPrefix, trimSuffix} from "@server/utils/strings"
import {projectTolkStdlibPath} from "@server/languages/tolk/toolchain/toolchain"
import {filePathToUri, TOLK_PARSED_FILES_CACHE} from "@server/files"
import {ActonToml} from "@server/acton/ActonToml"

import type {TolkFile} from "./TolkFile"

export class ImportResolver {
    public static resolveImport(fromFile: TolkFile, importPath: string): string | null {
        if (importPath.startsWith("@stdlib/")) {
            return this.resolveStdlibPath(importPath)
        }

        if (importPath.startsWith("@")) {
            return this.resolveMappingPath(fromFile, importPath)
        }

        if (importPath.startsWith("./") || importPath.startsWith("../")) {
            return this.resolveLocalPath(fromFile, importPath)
        }

        // resolve `import "foo.tolk"` as local as well
        return this.resolveLocalPath(fromFile, importPath)
    }

    private static resolveLocalPath(file: TolkFile, localPath: string): string | null {
        const withoutExt = trimSuffix(localPath, ".tolk")
        const dir = path.dirname(file.fsPath)
        return path.join(dir, withoutExt) + ".tolk"
    }

    private static resolveStdlibPath(prefixedPath: string): string | null {
        const stdlibPath = projectTolkStdlibPath
        if (!stdlibPath) return null

        const withoutExt = trimSuffix(prefixedPath, ".tolk")
        const importPath = trimPrefix(withoutExt, "@stdlib/")
        return path.join(stdlibPath, importPath) + ".tolk"
    }

    private static resolveMappingPath(fromFile: TolkFile, prefixedPath: string): string | null {
        const actonToml = ActonToml.discover(fromFile.uri)
        if (!actonToml) return null

        const mappings = actonToml.getMappings()
        const firstSlash = prefixedPath.indexOf("/")
        const mappingKey =
            firstSlash === -1 ? prefixedPath.slice(1) : prefixedPath.slice(1, firstSlash)
        const mappingValue = mappings.get(mappingKey)
        if (!mappingValue) return null

        const subPath = firstSlash === -1 ? "" : prefixedPath.slice(firstSlash + 1)
        const withoutExt = trimSuffix(subPath, ".tolk")
        return path.join(actonToml.workingDir, mappingValue, withoutExt) + ".tolk"
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
