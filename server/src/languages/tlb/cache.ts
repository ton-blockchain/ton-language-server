//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {NamedNode} from "@server/languages/tlb/psi/TlbNode"
import {Cache} from "@server/cache/cache"

export class TlbCache {
    public readonly resolveCache: Cache<number, NamedNode[]> = new Cache()

    public clear(): void {
        console.info(`Clearing caches (resolve: ${this.resolveCache.size})`)
        this.resolveCache.clear()
    }
}

export const TLB_CACHE = new TlbCache()
