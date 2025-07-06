//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import type {Ty} from "@server/languages/tolk/types/ty"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {InferenceResult} from "@server/languages/tolk/type-inference"

export class Cache<TKey, TValue> {
    private readonly data: Map<TKey, TValue>

    public constructor() {
        this.data = new Map()
    }

    public cached(key: TKey, cb: () => TValue): TValue {
        const cached = this.data.get(key)
        if (cached !== undefined) {
            return cached
        }

        const value = cb()
        this.data.set(key, value)
        return value
    }

    public clear(): void {
        this.data.clear()
    }

    public get size(): number {
        return this.data.size
    }
}

export class CacheManager {
    public readonly typeCache: Cache<number, Ty | null>
    public readonly resolveCache: Cache<number, NamedNode | null>
    public readonly funcTypeCache: Cache<number, InferenceResult>
    public readonly importedFiles: Cache<string, TolkFile[]>

    public constructor() {
        this.typeCache = new Cache()
        this.resolveCache = new Cache()
        this.funcTypeCache = new Cache()
        this.importedFiles = new Cache()
    }

    public clear(): void {
        console.info(
            `Clearing caches (types: ${this.typeCache.size}, resolve: ${this.resolveCache.size}, imported files: ${this.importedFiles.size})`,
        )
        this.typeCache.clear()
        this.resolveCache.clear()
        this.funcTypeCache.clear()
        this.importedFiles.clear()
    }
}

export const TOLK_CACHE = new CacheManager()
