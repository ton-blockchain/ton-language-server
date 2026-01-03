//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as path from "node:path"

import type {Node as SyntaxNode} from "web-tree-sitter"

import type {Position} from "vscode-languageclient"

import {File} from "@server/psi/File"
import {
    Constant,
    Enum,
    Func,
    GetMethod,
    GlobalVariable,
    InstanceMethod,
    StaticMethod,
    Struct,
    TypeAlias,
} from "@server/languages/tolk/psi/Decls"
import {NamedNode} from "@server/languages/tolk/psi/TolkNode"

import {ImportResolver} from "@server/languages/tolk/psi/ImportResolver"
import {trimSuffix} from "@server/utils/strings"

import {TOLK_CACHE} from "@server/languages/tolk/cache"
import {TOLK_PARSED_FILES_CACHE} from "@server/files"

export class TolkFile extends File {
    public get fromStdlib(): boolean {
        return this.uri.includes("tolk-stdlib")
    }

    public get fromStubs(): boolean {
        return this.uri.endsWith("stubs.tolk")
    }

    public get isTestFile(): boolean {
        return this.uri.endsWith(".test.tolk")
    }

    public symbolAt(offset: number): string {
        return this.content[offset] ?? ""
    }

    public isImportedImplicitly(): boolean {
        if (this.fromStubs) return true
        if (!this.fromStdlib) return false
        return this.path.includes("common.tolk")
    }

    public positionForNextImport(): Position {
        const imports = this.imports()

        if (imports.length === 0) {
            return {
                line: 0,
                character: 0,
            }
        }

        const lastImport = imports.at(-1)
        if (!lastImport) {
            return {
                line: 0,
                character: 0,
            }
        }

        return {
            line: lastImport.endPosition.row + 1,
            character: lastImport.endPosition.column,
        }
    }

    private normalizeImportPath(path: string): string {
        // ./foo.tolk
        // ./foo
        // foo
        // ->
        // foo.tolk
        let withoutPrefix = path
        if (path.startsWith("./") || path.startsWith(".\\")) {
            withoutPrefix = path.slice(2)
        }

        const withoutSuffix = trimSuffix(withoutPrefix, ".tolk")
        return withoutSuffix + ".tolk"
    }

    public alreadyImport(filepath: string): boolean {
        const imports = this.imports()
            .map(node => node.childForFieldName("path"))
            .filter(node => node !== null)

        // for `./foo.tolk` it is `foo.tolk`
        const normalizedPath = this.normalizeImportPath(filepath)

        return imports.some(imp => {
            const importPath = this.normalizeImportPath(imp.text.slice(1, -1))
            return importPath === normalizedPath
        })
    }

    public imports(): SyntaxNode[] {
        return this.tree.rootNode.children
            .filter(node => node !== null && node.type === "import_directive")
            .filter(node => node !== null)
    }

    public importedFiles(): string[] {
        const imports = this.imports()
            .map(node => node.childForFieldName("path"))
            .filter(node => node !== null)
        return imports
            .map(it => ImportResolver.resolveImport(this, it.text.slice(1, -1)))
            .filter(it => it !== null)
    }

    public importPath(inFile: TolkFile): string {
        const filePath = this.path

        if (this.fromStdlib) {
            const candidates = ["tolk-stdlib"]
            for (const candidate of candidates) {
                if (filePath.includes(candidate)) {
                    const relative = filePath.slice(
                        filePath.indexOf(candidate) + candidate.length + 1,
                    )
                    const withoutExt = trimSuffix(relative, ".tolk")
                    return `@stdlib/${withoutExt}`
                }
            }

            return filePath
        }

        const relativeTo = path.dirname(inFile.path)
        const relative = path.relative(relativeTo, filePath).replace(/\\/g, "/")
        const withoutExt = trimSuffix(relative, ".tolk")

        if (!withoutExt.startsWith("../") && !withoutExt.startsWith("./")) {
            return withoutExt
        }

        return withoutExt
    }

    public importedBy(): TolkFile[] {
        return TOLK_CACHE.importedFiles.cached(this.uri, () => this.importedByImpl())
    }

    private importedByImpl(): TolkFile[] {
        const files: TolkFile[] = []

        for (const [, parsedFile] of TOLK_PARSED_FILES_CACHE) {
            const importedFiles = parsedFile.importedFiles()
            if (importedFiles.length === 0) continue // file without imports cannot use this file

            const usesFile = importedFiles.includes(this.path)
            if (usesFile) {
                files.push(parsedFile)
            }
        }

        return files
    }

    public getDecls(): NamedNode[] {
        return this.getNodesByType(
            [
                "function_declaration",
                "method_declaration",
                "get_method_declaration",
                "global_var_declaration",
                "type_alias_declaration",
                "struct_declaration",
                "enum_declaration",
                "constant_declaration",
            ],
            NamedNode,
        )
    }

    public getFunctions(): Func[] {
        return this.getNodesByType("function_declaration", Func)
    }

    public getMethods(): (InstanceMethod | StaticMethod)[] {
        return this.getNodesByType("method_declaration", Func).map(func => {
            if (func.isStaticMethod()) return new StaticMethod(func.node, func.file)
            return new InstanceMethod(func.node, func.file)
        })
    }

    public getGetMethods(): GetMethod[] {
        return this.getNodesByType("get_method_declaration", GetMethod)
    }

    public getGlobalVariables(): GlobalVariable[] {
        return this.getNodesByType("global_var_declaration", GlobalVariable)
    }

    public getTypeAliases(): TypeAlias[] {
        return this.getNodesByType("type_alias_declaration", TypeAlias)
    }

    public getStructs(): Struct[] {
        return this.getNodesByType("struct_declaration", Struct)
    }

    public getEnums(): Enum[] {
        return this.getNodesByType("enum_declaration", Enum)
    }

    public getConstants(): Constant[] {
        return this.getNodesByType("constant_declaration", Constant)
    }

    private getNodesByType<T extends NamedNode>(
        nodeType: string | string[],
        constructor: new (node: SyntaxNode, file: TolkFile) => T,
    ): T[] {
        const tree = this.tree
        const types = Array.isArray(nodeType) ? nodeType : [nodeType]

        return tree.rootNode.children
            .filter(node => node !== null && types.includes(node.type))
            .filter(node => node !== null)
            .map(node => new constructor(node, this))
    }
}
