//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {NamedNode} from "@server/languages/func/psi/FuncNode"
import {Cache} from "@server/cache/cache"

export class FuncCache {
    public readonly resolveCache: Cache<number, NamedNode | null> = new Cache()

    public clear(): void {
        console.info(`Clearing caches (resolve: ${this.resolveCache.size})`)
        this.resolveCache.clear()
    }
}

export const FUNC_CACHE = new FuncCache()
