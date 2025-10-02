//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {fileURLToPath} from "node:url"

import {NamedNode} from "@server/languages/func/psi/FuncNode"
import {FuncFile} from "@server/languages/func/psi/FuncFile"
import {Constant, Func, GlobalVariable} from "@server/languages/func/psi/Decls"
import {ScopeProcessor} from "@server/languages/func/psi/Reference"
import {FUNC_CACHE} from "@server/languages/func/cache"
import {FUNC_PARSED_FILES_CACHE} from "@server/files"
import {ResolveState} from "@server/psi/ResolveState"

export interface IndexKeyToType {
    readonly [IndexKey.GlobalVariables]: GlobalVariable
    readonly [IndexKey.Funcs]: Func
    readonly [IndexKey.Constants]: Constant
}

export enum IndexKey {
    GlobalVariables = "GlobalVariables",
    Funcs = "Funcs",
    Constants = "Constants",
}

export interface IndexFinder {
    processElementsByKey: (key: IndexKey, processor: ScopeProcessor, state: ResolveState) => boolean
}

export class FileIndex {
    private readonly elements: {
        [IndexKey.GlobalVariables]: GlobalVariable[]
        [IndexKey.Funcs]: Func[]
        [IndexKey.Constants]: Constant[]
    } = {
        [IndexKey.GlobalVariables]: [],
        [IndexKey.Funcs]: [],
        [IndexKey.Constants]: [],
    }

    public static create(file: FuncFile): FileIndex {
        const index = new FileIndex()

        for (const node of file.rootNode.children) {
            if (!node) continue

            if (node.type === "function_declaration") {
                index.elements[IndexKey.Funcs].push(new Func(node, file))
            }
            if (node.type === "constant_declarations") {
                const decls = node.childrenForFieldName("decls")
                for (const decl of decls) {
                    if (!decl) continue
                    if (decl.type === "constant_declaration") {
                        const constant = new Constant(decl, file)
                        index.elements[IndexKey.Constants].push(constant)
                    }
                }
            }
            if (node.type === "global_var_declarations") {
                const decls = node.childrenForFieldName("decls")
                for (const decl of decls) {
                    if (!decl) continue
                    if (decl.type === "global_var_declaration") {
                        const variable = new GlobalVariable(decl, file)
                        index.elements[IndexKey.GlobalVariables].push(variable)
                    }
                }
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
            case IndexKey.GlobalVariables: {
                return this.findElements(
                    this.elements[IndexKey.GlobalVariables],
                    name,
                ) as IndexKeyToType[K][]
            }
            case IndexKey.Funcs: {
                return this.findElements(this.elements[IndexKey.Funcs], name) as IndexKeyToType[K][]
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
}

export class IndexRoot {
    public readonly name: "stdlib" | "stubs" | "workspace"
    public readonly root: string
    public readonly files: Map<string, FileIndex> = new Map()

    public constructor(name: "stdlib" | "stubs" | "workspace", root: string) {
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
        return filepath.startsWith(rootDir)
    }

    public addFile(uri: string, file: FuncFile, clearCache: boolean = true): void {
        if (this.files.has(uri)) {
            return
        }

        if (clearCache) {
            FUNC_CACHE.clear()
        }

        const index = FileIndex.create(file)
        this.files.set(uri, index)

        console.info(`added ${uri} to index`)
    }

    public removeFile(uri: string): void {
        FUNC_CACHE.clear()

        this.files.delete(uri)
        FUNC_PARSED_FILES_CACHE.delete(uri)

        console.info(`removed ${uri} from index`)
    }

    public fileChanged(uri: string): void {
        FUNC_CACHE.clear()
        this.files.delete(uri)
        console.info(`found changes in ${uri}`)
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
        file: FuncFile,
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
                value.elementByName(IndexKey.GlobalVariables, name) ??
                value.elementByName(IndexKey.Constants, name)

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
                value.elementByName(IndexKey.Constants, name) ??
                value.elementByName(IndexKey.GlobalVariables, name)

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
        if (this.stdlibRoot) {
            roots.push(this.stdlibRoot)
        }
        if (this.stubsRoot) {
            roots.push(this.stubsRoot)
        }
        roots.push(...this.roots)
        return roots
    }

    public findRootFor(path: string): IndexRoot | undefined {
        for (const root of this.allRoots()) {
            if (root.contains(path)) {
                return root
            }
        }

        console.warn(`cannot find index root for ${path}`)
        return undefined
    }

    public addFile(uri: string, file: FuncFile, clearCache: boolean = true): void {
        const indexRoot = this.findRootFor(uri)
        if (!indexRoot) return

        indexRoot.addFile(uri, file, clearCache)
    }

    public removeFile(uri: string): void {
        const indexRoot = this.findRootFor(uri)
        if (!indexRoot) return

        indexRoot.removeFile(uri)
    }

    public fileChanged(uri: string): void {
        const indexRoot = this.findRootFor(uri)
        if (!indexRoot) return

        indexRoot.fileChanged(uri)
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
        file: FuncFile,
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
