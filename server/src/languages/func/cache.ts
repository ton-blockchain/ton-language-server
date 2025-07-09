//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {NamedNode} from "@server/languages/func/psi/FuncNode"

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
    public readonly resolveCache: Cache<number, NamedNode | null>

    public constructor() {
        this.resolveCache = new Cache()
    }

    public clear(): void {
        console.info(`Clearing caches (resolve: ${this.resolveCache.size})`)
        this.resolveCache.clear()
    }
}

export const FUNC_CACHE = new CacheManager()
