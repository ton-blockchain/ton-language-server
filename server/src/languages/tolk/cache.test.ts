import {TolkCache, TolkRootAnalysisCache} from "./cache"
import type {TolkFile} from "./psi/TolkFile"

function file(uri: string): TolkFile {
    return {uri} as TolkFile
}

describe("Tolk cache aliases", () => {
    it("uses the same file cache for canonical URI and aliases", () => {
        const rootCache = new TolkRootAnalysisCache()
        rootCache.bindUri("file:///project/%40stdlib/common.tolk", [
            "file:///project/@stdlib/common.tolk",
        ])

        rootCache.forUri("file:///project/@stdlib/common.tolk").typeCache.setValue(1, null)

        expect(rootCache.forUri("file:///project/%40stdlib/common.tolk").typeCache.size).toBe(1)
    })

    it("unbinds all aliases for a file", () => {
        const cache = new TolkCache()
        const rootCache = new TolkRootAnalysisCache()

        cache.bindFile("file:///project/%40stdlib/common.tolk", rootCache, [
            "file:///project/@stdlib/common.tolk",
        ])
        cache.forFile(file("file:///project/@stdlib/common.tolk")).typeCache.setValue(1, null)

        cache.unbindFile("file:///project/@stdlib/common.tolk")

        expect(rootCache.uris()).toEqual([])
        expect(cache.forFile(file("file:///project/@stdlib/common.tolk")).typeCache.size).toBe(0)
    })

    it("reports stats only for selected file caches", () => {
        const rootCache = new TolkRootAnalysisCache()

        rootCache.forUri("file:///project/a.tolk").typeCache.setValue(1, null)
        rootCache.forUri("file:///project/b.tolk").typeCache.setValue(2, null)
        rootCache.forUri("file:///project/b.tolk").resolveCache.setValue(3, null)

        expect(rootCache.statsForUris(["file:///project/b.tolk"])).toBe(
            "files: 1, types: 1, resolve: 1, func types: 0",
        )
    })
})
