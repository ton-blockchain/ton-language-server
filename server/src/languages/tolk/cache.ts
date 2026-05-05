//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import type {Ty} from "@server/languages/tolk/types/ty"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {InferenceResult} from "@server/languages/tolk/type-inference"
import {Cache} from "@server/cache/cache"

export class TolkAnalysisCache {
    public readonly typeCache: Cache<number, Ty | null> = new Cache()
    public readonly resolveCache: Cache<number, NamedNode | null> = new Cache()
    public readonly funcTypeCache: Cache<number, InferenceResult> = new Cache()

    public stats(): string {
        return `types: ${this.typeCache.size}, resolve: ${this.resolveCache.size}, func types: ${this.funcTypeCache.size}`
    }

    public clear(): void {
        this.typeCache.clear()
        this.resolveCache.clear()
        this.funcTypeCache.clear()
    }
}

export class TolkRootAnalysisCache {
    private readonly fileCaches: Map<string, TolkAnalysisCache> = new Map()
    private readonly aliases: Map<string, string> = new Map()

    public forUri(uri: string): TolkAnalysisCache {
        const canonicalUri = this.aliases.get(uri) ?? uri
        let cache = this.fileCaches.get(canonicalUri)
        if (!cache) {
            cache = new TolkAnalysisCache()
            this.fileCaches.set(canonicalUri, cache)
        }
        return cache
    }

    public bindUri(uri: string, aliases: Iterable<string> = []): void {
        this.forUri(uri)
        for (const alias of aliases) {
            this.aliases.set(alias, uri)
        }
    }

    public deleteUri(uri: string): void {
        const canonicalUri = this.aliases.get(uri) ?? uri
        this.fileCaches.delete(canonicalUri)

        const aliasesToDelete: string[] = []
        for (const [alias, target] of this.aliases) {
            if (alias === uri || target === canonicalUri) {
                aliasesToDelete.push(alias)
            }
        }

        for (const alias of aliasesToDelete) {
            this.aliases.delete(alias)
        }
    }

    public clearUris(uris: Iterable<string>): void {
        for (const uri of uris) {
            const canonicalUri = this.aliases.get(uri) ?? uri
            this.fileCaches.get(canonicalUri)?.clear()
        }
    }

    public statsForUris(uris: Iterable<string>): string {
        let files = 0
        let types = 0
        let resolve = 0
        let funcTypes = 0
        const seen: Set<string> = new Set()

        for (const uri of uris) {
            const canonicalUri = this.aliases.get(uri) ?? uri
            if (seen.has(canonicalUri)) continue
            seen.add(canonicalUri)

            const cache = this.fileCaches.get(canonicalUri)
            if (!cache) continue

            files++
            types += cache.typeCache.size
            resolve += cache.resolveCache.size
            funcTypes += cache.funcTypeCache.size
        }

        return `files: ${files}, types: ${types}, resolve: ${resolve}, func types: ${funcTypes}`
    }

    public clear(): void {
        for (const cache of this.fileCaches.values()) {
            cache.clear()
        }
    }

    public uris(): string[] {
        return [...this.fileCaches.keys()]
    }

    public stats(): string {
        let types = 0
        let resolve = 0
        let funcTypes = 0

        for (const cache of this.fileCaches.values()) {
            types += cache.typeCache.size
            resolve += cache.resolveCache.size
            funcTypes += cache.funcTypeCache.size
        }

        return `files: ${this.fileCaches.size}, types: ${types}, resolve: ${resolve}, func types: ${funcTypes}`
    }
}

export class TolkCache {
    private readonly fallbackAnalysisCache: TolkAnalysisCache = new TolkAnalysisCache()
    private readonly fileRootCaches: Map<string, TolkRootAnalysisCache> = new Map()
    private readonly fileAliases: Map<string, Set<string>> = new Map()
    public readonly importedFiles: Cache<string, TolkFile[]> = new Cache()
    public readonly importedFilePaths: Cache<string, string[]> = new Cache()

    public bindFile(
        uri: string,
        cache: TolkRootAnalysisCache,
        aliases: Iterable<string> = [],
    ): void {
        const allAliases: Set<string> = new Set([uri])
        for (const alias of aliases) {
            allAliases.add(alias)
        }
        cache.bindUri(uri, allAliases)

        for (const alias of allAliases) {
            this.fileRootCaches.set(alias, cache)
            this.fileAliases.set(alias, allAliases)
        }
    }

    public unbindFile(uri: string): void {
        const cache = this.fileRootCaches.get(uri)
        const aliases = this.fileAliases.get(uri) ?? new Set([uri])
        cache?.deleteUri(uri)

        for (const alias of aliases) {
            this.fileRootCaches.delete(alias)
            this.fileAliases.delete(alias)
        }
    }

    public forFile(file: TolkFile): TolkAnalysisCache {
        return this.fileRootCaches.get(file.uri)?.forUri(file.uri) ?? this.fallbackAnalysisCache
    }

    public clearImportedFiles(): void {
        this.importedFiles.clear()
        this.importedFilePaths.clear()
    }

    public clear(): void {
        this.fallbackAnalysisCache.clear()
        for (const cache of new Set(this.fileRootCaches.values())) {
            cache.clear()
        }
        this.importedFiles.clear()
        this.importedFilePaths.clear()
    }
}

export const TOLK_CACHE = new TolkCache()
