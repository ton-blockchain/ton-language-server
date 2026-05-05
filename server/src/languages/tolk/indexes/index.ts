//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import * as path from "node:path"
import {fileURLToPath} from "node:url"

import {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {
    Constant,
    ContractDefinition,
    Enum,
    Func,
    GetMethod,
    GlobalVariable,
    InstanceMethod,
    StaticMethod,
    Struct,
    TypeAlias,
} from "@server/languages/tolk/psi/Decls"
import {ScopeProcessor} from "@server/languages/tolk/psi/Reference"
import {TOLK_CACHE, TolkRootAnalysisCache} from "@server/languages/tolk/cache"
import {TOLK_PARSED_FILES_CACHE} from "@server/files"
import {ResolveState} from "@server/psi/ResolveState"

export interface IndexKeyToType {
    readonly [IndexKey.GlobalVariables]: GlobalVariable
    readonly [IndexKey.TypeAlias]: TypeAlias
    readonly [IndexKey.Funcs]: Func
    readonly [IndexKey.Methods]: InstanceMethod | StaticMethod
    readonly [IndexKey.GetMethods]: GetMethod
    readonly [IndexKey.Structs]: Struct
    readonly [IndexKey.Enums]: Enum
    readonly [IndexKey.Contracts]: ContractDefinition
    readonly [IndexKey.Constants]: Constant
}

export enum IndexKey {
    GlobalVariables = "GlobalVariables",
    TypeAlias = "TypeAlias",
    Funcs = "Funcs",
    Methods = "Methods",
    GetMethods = "GetMethods",
    Structs = "Structs",
    Enums = "Enums",
    Contracts = "Contracts",
    Constants = "Constants",
}

export interface IndexFinder {
    processElementsByKey: (key: IndexKey, processor: ScopeProcessor, state: ResolveState) => boolean
}

export class FileIndex {
    private readonly elements: {
        [IndexKey.GlobalVariables]: GlobalVariable[]
        [IndexKey.TypeAlias]: TypeAlias[]
        [IndexKey.Funcs]: Func[]
        [IndexKey.Methods]: (InstanceMethod | StaticMethod)[]
        [IndexKey.GetMethods]: GetMethod[]
        [IndexKey.Structs]: Struct[]
        [IndexKey.Enums]: Enum[]
        [IndexKey.Contracts]: ContractDefinition[]
        [IndexKey.Constants]: Constant[]
    } = {
        [IndexKey.GlobalVariables]: [],
        [IndexKey.TypeAlias]: [],
        [IndexKey.Funcs]: [],
        [IndexKey.Methods]: [],
        [IndexKey.GetMethods]: [],
        [IndexKey.Structs]: [],
        [IndexKey.Enums]: [],
        [IndexKey.Contracts]: [],
        [IndexKey.Constants]: [],
    }

    private readonly deprecated: Map<string, string> = new Map()

    public static create(file: TolkFile): FileIndex {
        const index = new FileIndex()

        for (const node of file.rootNode.children) {
            if (!node) continue

            if (node.type === "function_declaration") {
                index.elements[IndexKey.Funcs].push(new Func(node, file))
            }
            if (node.type === "method_declaration") {
                const fun = new Func(node, file)
                if (fun.isInstanceMethod()) {
                    index.elements[IndexKey.Methods].push(new InstanceMethod(node, file))
                } else if (fun.isStaticMethod()) {
                    index.elements[IndexKey.Methods].push(new StaticMethod(node, file))
                }
            }
            if (node.type === "get_method_declaration") {
                index.elements[IndexKey.GetMethods].push(new GetMethod(node, file))
            }
            if (node.type === "type_alias_declaration") {
                const typeAlias = new TypeAlias(node, file)
                index.elements[IndexKey.TypeAlias].push(typeAlias)
            }
            if (node.type === "struct_declaration") {
                const struct = new Struct(node, file)
                index.elements[IndexKey.Structs].push(struct)
            }
            if (node.type === "enum_declaration") {
                const enum_ = new Enum(node, file)
                index.elements[IndexKey.Enums].push(enum_)
            }
            if (node.type === "contract_declaration") {
                const contract = new ContractDefinition(node, file)
                index.elements[IndexKey.Contracts].push(contract)
            }
            if (node.type === "constant_declaration") {
                const constant = new Constant(node, file)
                index.elements[IndexKey.Constants].push(constant)
            }
            if (node.type === "global_var_declaration") {
                const variable = new GlobalVariable(node, file)
                index.elements[IndexKey.GlobalVariables].push(variable)
            }
        }

        return index
    }

    public processElementsByKey(
        key: IndexKey,
        processor: ScopeProcessor,
        state: ResolveState,
    ): boolean {
        const elements = this.elements[key]
        for (const node of elements) {
            if (!processor.execute(node, state)) return false
        }
        return true
    }

    public elementByName<K extends IndexKey>(key: K, name: string): IndexKeyToType[K] | null {
        switch (key) {
            case IndexKey.TypeAlias: {
                return this.findElement(this.elements[IndexKey.TypeAlias], name) as
                    | IndexKeyToType[K]
                    | null
            }
            case IndexKey.GlobalVariables: {
                return this.findElement(this.elements[IndexKey.GlobalVariables], name) as
                    | IndexKeyToType[K]
                    | null
            }
            case IndexKey.Funcs: {
                return this.findElement(this.elements[IndexKey.Funcs], name) as
                    | IndexKeyToType[K]
                    | null
            }
            case IndexKey.Methods: {
                return this.findElement(this.elements[IndexKey.Methods], name) as
                    | IndexKeyToType[K]
                    | null
            }
            case IndexKey.GetMethods: {
                return this.findElement(this.elements[IndexKey.GetMethods], name) as
                    | IndexKeyToType[K]
                    | null
            }
            case IndexKey.Structs: {
                return this.findElement(this.elements[IndexKey.Structs], name) as
                    | IndexKeyToType[K]
                    | null
            }
            case IndexKey.Enums: {
                return this.findElement(this.elements[IndexKey.Enums], name) as
                    | IndexKeyToType[K]
                    | null
            }
            case IndexKey.Contracts: {
                return this.findElement(this.elements[IndexKey.Contracts], name) as
                    | IndexKeyToType[K]
                    | null
            }
            case IndexKey.Constants: {
                return this.findElement(this.elements[IndexKey.Constants], name) as
                    | IndexKeyToType[K]
                    | null
            }
            default: {
                return null
            }
        }
    }

    public elementsByName<K extends IndexKey>(key: K, name: string): IndexKeyToType[K][] {
        switch (key) {
            case IndexKey.TypeAlias: {
                return this.findElements(
                    this.elements[IndexKey.TypeAlias],
                    name,
                ) as IndexKeyToType[K][]
            }
            case IndexKey.GlobalVariables: {
                return this.findElements(
                    this.elements[IndexKey.GlobalVariables],
                    name,
                ) as IndexKeyToType[K][]
            }
            case IndexKey.Funcs: {
                return this.findElements(this.elements[IndexKey.Funcs], name) as IndexKeyToType[K][]
            }
            case IndexKey.Methods: {
                return this.findElements(
                    this.elements[IndexKey.Methods],
                    name,
                ) as IndexKeyToType[K][]
            }
            case IndexKey.GetMethods: {
                return this.findElements(
                    this.elements[IndexKey.GetMethods],
                    name,
                ) as IndexKeyToType[K][]
            }
            case IndexKey.Structs: {
                return this.findElements(
                    this.elements[IndexKey.Structs],
                    name,
                ) as IndexKeyToType[K][]
            }
            case IndexKey.Enums: {
                return this.findElements(this.elements[IndexKey.Enums], name) as IndexKeyToType[K][]
            }
            case IndexKey.Contracts: {
                return this.findElements(
                    this.elements[IndexKey.Contracts],
                    name,
                ) as IndexKeyToType[K][]
            }
            case IndexKey.Constants: {
                return this.findElements(
                    this.elements[IndexKey.Constants],
                    name,
                ) as IndexKeyToType[K][]
            }
            default: {
                return []
            }
        }
    }

    private findElement<T extends NamedNode>(elements: T[], name: string): T | null {
        return elements.find(value => value.name() === name) ?? null
    }

    private findElements<T extends NamedNode>(elements: T[], name: string): T[] {
        return elements.filter(value => value.name() === name)
    }

    public isDeprecated(name: string): boolean {
        return this.deprecated.has(name)
    }
}

export class IndexRoot {
    public readonly name: "stdlib" | "stubs" | "acton" | "workspace"
    public readonly root: string
    public readonly files: Map<string, FileIndex> = new Map()
    public readonly cache: TolkRootAnalysisCache = new TolkRootAnalysisCache()

    public constructor(name: "stdlib" | "stubs" | "acton" | "workspace", root: string) {
        this.name = name
        this.root = root
    }

    public contains(file: string): boolean {
        if (!file.startsWith("file:")) {
            // most likely VS Code temp file can be only in the workspace
            return this.name === "workspace"
        }
        const filepath = fileURLToPath(file)
        const rootDir = fileURLToPath(this.root)
        const relative = path.relative(rootDir, filepath)
        return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
    }

    public addFile(uri: string, file: TolkFile, clearCache: boolean = true): void {
        if (this.files.has(uri)) {
            TOLK_CACHE.bindFile(uri, this.cache, [file.uri])
            return
        }

        if (clearCache) {
            this.clearDependentCaches("add", uri)
        }

        const index = FileIndex.create(file)
        this.files.set(uri, index)
        TOLK_CACHE.bindFile(uri, this.cache, [file.uri])

        console.info(`added ${uri} to index`)
    }

    public removeFile(uri: string): void {
        this.clearDependentCaches("remove", uri)

        this.files.delete(uri)
        TOLK_PARSED_FILES_CACHE.delete(uri)
        TOLK_CACHE.unbindFile(uri)

        console.info(`removed ${uri} from index`)
    }

    public fileChanged(uri: string): void {
        this.clearDependentCaches("change", uri)
        this.files.delete(uri)
        TOLK_CACHE.unbindFile(uri)
        console.info(`found changes in ${uri}`)
    }

    public clearOwnCache(): void {
        console.info(`Clearing Tolk ${this.name} cache (${this.cache.stats()})`)
        this.cache.clear()
    }

    public clearFileCaches(uris: readonly string[]): void {
        this.cache.clearUris(uris)
    }

    public fileUris(): string[] {
        return [...new Set([...this.files.keys(), ...this.cache.uris()])]
    }

    private clearDependentCaches(reason: "add" | "change" | "remove", uri: string): void {
        const allRoots = index.allRoots()
        const invalidatedUris = index.cacheInvalidationUris(this, uri)
        const invalidatedRoots = allRoots
            .map(root => {
                const count = invalidatedUris.filter(it => root.contains(it)).length
                return count === 0 ? null : `${root.name}: ${count}`
            })
            .filter(root => root !== null)
            .join(", ")
        const preservedRootStats = allRoots
            .filter(root => !invalidatedUris.some(uri => root.contains(uri)))
            .map(root => `${root.name} (${root.cache.stats()})`)
            .join("; ")
        const invalidatedFiles = this.formatInvalidatedUris(invalidatedUris)
        console.info(
            `Invalidating Tolk caches after ${reason} in ${this.name} root; files: ${invalidatedUris.length}; affected roots: ${invalidatedRoots || "none"}; invalidated files: ${invalidatedFiles}; preserved roots: ${preservedRootStats || "none"}; imported files: ${TOLK_CACHE.importedFiles.size}`,
        )
        TOLK_CACHE.clearImportedFiles()
        index.clearFileCaches(invalidatedUris)
    }

    private formatInvalidatedUris(uris: readonly string[]): string {
        if (uris.length === 0) return "none"

        const shown = uris.slice(0, 5).join(", ")
        if (uris.length <= 5) return shown

        return `${shown}, +${uris.length - 5} more`
    }

    public findFile(uri: string): FileIndex | undefined {
        return this.files.get(uri)
    }

    public findRelativeFile(path: string): FileIndex | undefined {
        const searchPath = this.relativePath(path)
        return this.files.get(searchPath)
    }

    private relativePath(path: string): string {
        if (this.root.endsWith("/") || this.root.endsWith("\\")) {
            return this.root + path
        }
        return this.root + "/" + path
    }

    public processElementsByKey(
        key: IndexKey,
        processor: ScopeProcessor,
        state: ResolveState,
    ): boolean {
        for (const value of this.files.values()) {
            if (!value.processElementsByKey(key, processor, state)) return false
        }
        return true
    }

    public processElsByKeyAndFile(
        key: IndexKey,
        file: TolkFile,
        processor: ScopeProcessor,
        state: ResolveState,
    ): boolean {
        const fileIndex = this.files.get(file.uri)
        if (fileIndex !== undefined) {
            if (!fileIndex.processElementsByKey(key, processor, state)) return false
        }

        for (const [k, value] of this.files) {
            if (k === file.uri) continue
            if (!value.processElementsByKey(key, processor, state)) return false
        }
        return true
    }

    public elementByName<K extends IndexKey>(key: K, name: string): IndexKeyToType[K] | null {
        for (const value of this.files.values()) {
            const result = value.elementByName(key, name)
            if (result) {
                return result
            }
        }
        return null
    }

    public elementsByName<K extends IndexKey>(key: K, name: string): IndexKeyToType[K][] {
        for (const value of this.files.values()) {
            const result = value.elementsByName(key, name)
            if (result.length > 0) {
                return result
            }
        }
        return []
    }

    public hasDeclaration(name: string): boolean {
        for (const value of this.files.values()) {
            const element =
                value.elementByName(IndexKey.Funcs, name) ??
                value.elementByName(IndexKey.GetMethods, name) ??
                value.elementByName(IndexKey.TypeAlias, name) ??
                value.elementByName(IndexKey.GlobalVariables, name) ??
                value.elementByName(IndexKey.Constants, name) ??
                value.elementByName(IndexKey.Structs, name) ??
                value.elementByName(IndexKey.Enums, name)

            if (element) {
                return true
            }
        }
        return false
    }

    public hasSeveralDeclarations(name: string): boolean {
        let seen = false
        for (const value of this.files.values()) {
            const element =
                value.elementByName(IndexKey.Funcs, name) ??
                value.elementByName(IndexKey.GetMethods, name) ??
                value.elementByName(IndexKey.TypeAlias, name) ??
                value.elementByName(IndexKey.Constants, name) ??
                value.elementByName(IndexKey.GlobalVariables, name) ??
                value.elementByName(IndexKey.TypeAlias, name) ??
                value.elementByName(IndexKey.Structs, name)

            if (element && seen) {
                return true
            }

            if (element) {
                seen = true
            }
        }
        return false
    }
}

export class GlobalIndex {
    public stdlibRoot: IndexRoot | undefined = undefined
    public stubsRoot: IndexRoot | undefined = undefined
    public roots: IndexRoot[] = []
    private readonly importsByUri: Map<string, Set<string>> = new Map()
    private readonly importersByPath: Map<string, Set<string>> = new Map()
    private readonly pathByUri: Map<string, string> = new Map()
    private readonly aliasesByUri: Map<string, Set<string>> = new Map()

    public withStdlibRoot(root: IndexRoot): void {
        this.stdlibRoot = root
    }

    public withStubsRoot(root: IndexRoot): void {
        this.stubsRoot = root
    }

    public withRoots(roots: IndexRoot[]): void {
        this.roots = roots
    }

    public allRoots(): IndexRoot[] {
        const roots: IndexRoot[] = []
        if (this.stubsRoot) {
            roots.push(this.stubsRoot)
        }
        if (this.stdlibRoot) {
            roots.push(this.stdlibRoot)
        }
        roots.push(...this.roots)
        return roots
    }

    public clearRootsDependentOn(changedRoot: IndexRoot, dependentRoots?: IndexRoot[]): void {
        for (const root of dependentRoots ?? this.rootsDependentOn(changedRoot)) {
            if (root === changedRoot) continue
            root.clearOwnCache()
        }
    }

    public clearFileCaches(uris: readonly string[]): void {
        for (const root of this.allRoots()) {
            const rootUris = uris.filter(uri => root.contains(uri))
            if (rootUris.length === 0) continue

            console.info(
                `Clearing Tolk ${root.name} file caches (${root.cache.statsForUris(rootUris)}; root before: ${root.cache.stats()})`,
            )
            root.clearFileCaches(rootUris)
        }
    }

    public rootsDependentOn(changedRoot: IndexRoot): IndexRoot[] {
        const roots = this.allRoots()
        if (changedRoot.name === "stubs" || changedRoot.name === "stdlib") {
            return roots
        }

        if (changedRoot.name === "acton") {
            return roots.filter(root => root.name === "workspace")
        }

        return []
    }

    public updateImportGraph(uri: string, file: TolkFile): void {
        this.removeFromImportGraph(uri)

        const filePath = this.normalizePath(file.path)
        this.pathByUri.set(uri, filePath)
        if (file.uri !== uri) {
            this.pathByUri.set(file.uri, filePath)
            this.aliasesByUri.set(uri, new Set([file.uri]))
        }

        const importedPaths = new Set(
            file.importedFiles().map(imported => this.normalizePath(imported)),
        )
        this.importsByUri.set(uri, importedPaths)

        for (const importedPath of importedPaths) {
            const importers = this.importersByPath.get(importedPath) ?? new Set<string>()
            importers.add(uri)
            this.importersByPath.set(importedPath, importers)
        }
    }

    public removeFromImportGraph(uri: string): void {
        const importedPaths = this.importsByUri.get(uri)
        if (importedPaths) {
            for (const importedPath of importedPaths) {
                const importers = this.importersByPath.get(importedPath)
                if (!importers) continue

                importers.delete(uri)
                if (importers.size === 0) {
                    this.importersByPath.delete(importedPath)
                }
            }
        }

        this.importsByUri.delete(uri)
        this.pathByUri.delete(uri)
        const aliases = this.aliasesByUri.get(uri)
        if (aliases) {
            for (const alias of aliases) {
                this.pathByUri.delete(alias)
            }
        }
        this.aliasesByUri.delete(uri)
    }

    public rebuildImportGraphFromParsedFiles(): void {
        this.importsByUri.clear()
        this.importersByPath.clear()
        this.pathByUri.clear()
        this.aliasesByUri.clear()

        for (const [uri, file] of TOLK_PARSED_FILES_CACHE) {
            this.updateImportGraph(uri, file)
        }
    }

    public cacheInvalidationUris(changedRoot: IndexRoot, changedUri: string): string[] {
        const affectedRoots: Set<IndexRoot> = new Set([
            changedRoot,
            ...this.rootsDependentOn(changedRoot),
        ])

        if (this.isImplicitlyImported(changedRoot, changedUri)) {
            const result: Set<string> = new Set([changedUri])
            for (const root of affectedRoots) {
                for (const uri of root.fileUris()) {
                    result.add(uri)
                }
            }
            return [...result]
        }

        const result: Set<string> = new Set()
        const queued: Set<string> = new Set([changedUri])
        const queue: string[] = [changedUri]
        const visitedPaths: Set<string> = new Set()

        while (queue.length > 0) {
            const currentUri = queue.shift()
            if (!currentUri) continue

            result.add(currentUri)

            const currentPath = this.pathForUri(currentUri)
            if (visitedPaths.has(currentPath)) continue
            visitedPaths.add(currentPath)

            for (const candidateUri of this.importersByPath.get(currentPath) ?? []) {
                if (queued.has(candidateUri)) continue
                if (!this.isInRoots(candidateUri, affectedRoots)) continue

                queued.add(candidateUri)
                queue.push(candidateUri)
            }
        }

        return [...result]
    }

    private isImplicitlyImported(changedRoot: IndexRoot, changedUri: string): boolean {
        if (changedRoot.name === "stubs") return true
        if (changedRoot.name !== "stdlib") return false

        return this.pathForUri(changedUri).replace(/\\/g, "/").endsWith("/common.tolk")
    }

    private pathForUri(uri: string): string {
        const knownPath = this.pathByUri.get(uri)
        if (knownPath) return knownPath

        const file = TOLK_PARSED_FILES_CACHE.get(uri)
        if (file) return this.normalizePath(file.path)

        if (uri.startsWith("file:")) {
            return this.normalizePath(fileURLToPath(uri))
        }

        return uri
    }

    private normalizePath(filePath: string): string {
        return path.normalize(filePath)
    }

    private isInRoots(uri: string, roots: ReadonlySet<IndexRoot>): boolean {
        for (const root of roots) {
            if (root.contains(uri)) return true
        }
        return false
    }

    public findRootFor(path: string): IndexRoot | undefined {
        const roots = [...this.allRoots()].sort(
            (left, right) => right.root.length - left.root.length,
        )
        for (const root of roots) {
            if (root.contains(path)) {
                return root
            }
        }

        console.warn(`cannot find index root for ${path}`)
        return undefined
    }

    public addFile(uri: string, file: TolkFile, clearCache: boolean = true): void {
        const indexRoot = this.findRootFor(uri)
        if (!indexRoot) return

        indexRoot.addFile(uri, file, clearCache)
        this.updateImportGraph(uri, file)
    }

    public removeFile(uri: string): void {
        const indexRoot = this.findRootFor(uri)
        if (!indexRoot) return

        indexRoot.removeFile(uri)
        this.removeFromImportGraph(uri)
    }

    public fileChanged(uri: string): void {
        const indexRoot = this.findRootFor(uri)
        if (!indexRoot) return

        indexRoot.fileChanged(uri)
        this.removeFromImportGraph(uri)
    }

    public findFile(uri: string): FileIndex | undefined {
        const indexRoot = this.findRootFor(uri)
        if (!indexRoot) return undefined

        return indexRoot.findFile(uri)
    }

    public processElementsByKey(
        key: IndexKey,
        processor: ScopeProcessor,
        state: ResolveState,
    ): boolean {
        for (const root of this.allRoots()) {
            if (!root.processElementsByKey(key, processor, state)) return false
        }

        return true
    }

    public processElsByKeyAndFile(
        key: IndexKey,
        file: TolkFile,
        processor: ScopeProcessor,
        state: ResolveState,
    ): boolean {
        for (const root of this.allRoots()) {
            if (!root.processElsByKeyAndFile(key, file, processor, state)) return false
        }

        return true
    }

    public elementByName<K extends IndexKey>(key: K, name: string): IndexKeyToType[K] | null {
        for (const root of this.allRoots()) {
            const element = root.elementByName(key, name)
            if (element) return element
        }
        return null
    }

    public hasSeveralDeclarations(name: string): boolean {
        let seen = false
        for (const root of this.allRoots()) {
            const decl = root.hasDeclaration(name)
            if (decl && seen) {
                return true
            }
            if (decl) {
                const hasSeveralDecls = root.hasSeveralDeclarations(name)
                if (hasSeveralDecls) return true

                seen = true
            }
        }

        return false
    }
}

export const index = new GlobalIndex()
