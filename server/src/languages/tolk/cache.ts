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

export class TolkCache {
    private readonly fallbackAnalysisCache: TolkAnalysisCache = new TolkAnalysisCache()
    private readonly fileAnalysisCaches: Map<string, TolkAnalysisCache> = new Map()
    public readonly importedFiles: Cache<string, TolkFile[]> = new Cache()

    public bindFile(uri: string, cache: TolkAnalysisCache): void {
        this.fileAnalysisCaches.set(uri, cache)
    }

    public unbindFile(uri: string): void {
        this.fileAnalysisCaches.delete(uri)
    }

    public forFile(file: TolkFile): TolkAnalysisCache {
        return this.fileAnalysisCaches.get(file.uri) ?? this.fallbackAnalysisCache
    }

    public clearImportedFiles(): void {
        this.importedFiles.clear()
    }

    public clear(): void {
        console.info(`Clearing all Tolk caches (imported files: ${this.importedFiles.size})`)
        this.fallbackAnalysisCache.clear()
        for (const cache of new Set(this.fileAnalysisCaches.values())) {
            cache.clear()
        }
        this.importedFiles.clear()
    }
}

export const TOLK_CACHE = new TolkCache()
