//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import type {Ty} from "@server/languages/tolk/types/ty"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {InferenceResult} from "@server/languages/tolk/type-inference"
import {Cache} from "@server/cache/cache"

export class TolkCache {
    public readonly typeCache: Cache<number, Ty | null> = new Cache()
    public readonly resolveCache: Cache<number, NamedNode | null> = new Cache()
    public readonly funcTypeCache: Cache<number, InferenceResult> = new Cache()
    public readonly importedFiles: Cache<string, TolkFile[]> = new Cache()

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

export const TOLK_CACHE = new TolkCache()
