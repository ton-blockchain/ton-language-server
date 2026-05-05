import {TOLK_PARSED_FILES_CACHE} from "@server/files"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"

import {GlobalIndex, IndexRoot} from "./index"

function warm(root: IndexRoot, uri: string, key: number): void {
    root.cache.forUri(uri).typeCache.setValue(key, null)
}

function expectWarm(root: IndexRoot, uri: string): void {
    expect(root.cache.forUri(uri).typeCache.size).toBe(1)
}

function expectCold(root: IndexRoot, uri: string): void {
    expect(root.cache.forUri(uri).typeCache.size).toBe(0)
}

function parsed(uri: string, path: string, importedFiles: string[] = []): TolkFile {
    return {
        uri,
        path,
        importedFiles: () => importedFiles,
    } as unknown as TolkFile
}

function addParsed(index: GlobalIndex, uri: string, file: TolkFile): void {
    TOLK_PARSED_FILES_CACHE.set(uri, file)
    index.updateImportGraph(uri, file)
}

describe("GlobalIndex scoped cache invalidation", () => {
    let consoleInfoSpy: jest.SpyInstance

    beforeEach(() => {
        consoleInfoSpy = jest.spyOn(console, "info").mockImplementation()
    })

    afterEach(() => {
        consoleInfoSpy.mockRestore()
        TOLK_PARSED_FILES_CACHE.clear()
    })

    it("keeps library roots warm after workspace changes", () => {
        const index = new GlobalIndex()
        const stdlib = new IndexRoot("stdlib", "file:///project/.acton/tolk-stdlib")
        const acton = new IndexRoot("acton", "file:///project/.acton")
        const workspace = new IndexRoot("workspace", "file:///project")
        const stdlibUri = "file:///project/.acton/tolk-stdlib/common.tolk"
        const actonUri = "file:///project/.acton/wrapper.tolk"
        const workspaceUri = "file:///project/contracts/main.tolk"

        index.withStdlibRoot(stdlib)
        index.withRoots([acton, workspace])

        warm(stdlib, stdlibUri, 1)
        warm(acton, actonUri, 2)
        warm(workspace, workspaceUri, 3)

        index.clearFileCaches(index.cacheInvalidationUris(workspace, workspaceUri))

        expectWarm(stdlib, stdlibUri)
        expectWarm(acton, actonUri)
        expectCold(workspace, workspaceUri)
    })

    it("clears workspace importers after Acton root changes", () => {
        const index = new GlobalIndex()
        const stdlib = new IndexRoot("stdlib", "file:///project/.acton/tolk-stdlib")
        const acton = new IndexRoot("acton", "file:///project/.acton")
        const workspace = new IndexRoot("workspace", "file:///project")
        const stdlibUri = "file:///project/.acton/tolk-stdlib/common.tolk"
        const actonUri = "file:///project/.acton/wrapper.tolk"
        const workspaceUri = "file:///project/contracts/main.tolk"

        index.withStdlibRoot(stdlib)
        index.withRoots([acton, workspace])

        addParsed(
            index,
            workspaceUri,
            parsed(workspaceUri, "/project/contracts/main.tolk", ["/project/.acton/wrapper.tolk"]),
        )

        warm(stdlib, stdlibUri, 1)
        warm(acton, actonUri, 2)
        warm(workspace, workspaceUri, 3)

        index.clearFileCaches(index.cacheInvalidationUris(acton, actonUri))

        expectWarm(stdlib, stdlibUri)
        expectCold(acton, actonUri)
        expectCold(workspace, workspaceUri)
    })

    it("clears all roots after implicit stdlib common changes", () => {
        const index = new GlobalIndex()
        const stdlib = new IndexRoot("stdlib", "file:///project/.acton/tolk-stdlib")
        const acton = new IndexRoot("acton", "file:///project/.acton")
        const workspace = new IndexRoot("workspace", "file:///project")
        const stdlibUri = "file:///project/.acton/tolk-stdlib/common.tolk"
        const actonUri = "file:///project/.acton/wrapper.tolk"
        const workspaceUri = "file:///project/contracts/main.tolk"

        index.withStdlibRoot(stdlib)
        index.withRoots([acton, workspace])

        warm(stdlib, stdlibUri, 1)
        warm(acton, actonUri, 2)
        warm(workspace, workspaceUri, 3)

        index.clearFileCaches(index.cacheInvalidationUris(stdlib, stdlibUri))

        expectCold(stdlib, stdlibUri)
        expectCold(acton, actonUri)
        expectCold(workspace, workspaceUri)
    })

    it("invalidates importers after non-implicit stdlib changes without clearing unrelated files", () => {
        const index = new GlobalIndex()
        const stdlib = new IndexRoot("stdlib", "file:///project/.acton/tolk-stdlib")
        const acton = new IndexRoot("acton", "file:///project/.acton")
        const workspace = new IndexRoot("workspace", "file:///project")
        const stdlibUri = "file:///project/.acton/tolk-stdlib/math.tolk"
        const actonUri = "file:///project/.acton/wrapper.tolk"
        const workspaceUri = "file:///project/contracts/main.tolk"
        const unrelatedUri = "file:///project/contracts/unrelated.tolk"

        index.withStdlibRoot(stdlib)
        index.withRoots([acton, workspace])

        addParsed(index, stdlibUri, parsed(stdlibUri, "/project/.acton/tolk-stdlib/math.tolk"))
        addParsed(
            index,
            actonUri,
            parsed(actonUri, "/project/.acton/wrapper.tolk", [
                "/project/.acton/tolk-stdlib/math.tolk",
            ]),
        )
        addParsed(
            index,
            workspaceUri,
            parsed(workspaceUri, "/project/contracts/main.tolk", ["/project/.acton/wrapper.tolk"]),
        )
        addParsed(index, unrelatedUri, parsed(unrelatedUri, "/project/contracts/unrelated.tolk"))

        warm(stdlib, stdlibUri, 1)
        warm(acton, actonUri, 2)
        warm(workspace, workspaceUri, 3)
        warm(workspace, unrelatedUri, 4)

        index.clearFileCaches(index.cacheInvalidationUris(stdlib, stdlibUri))

        expectCold(stdlib, stdlibUri)
        expectCold(acton, actonUri)
        expectCold(workspace, workspaceUri)
        expectWarm(workspace, unrelatedUri)
    })

    it("invalidates transitive workspace importers without clearing unrelated files", () => {
        const index = new GlobalIndex()
        const workspace = new IndexRoot("workspace", "file:///project")
        const aUri = "file:///project/contracts/a.tolk"
        const bUri = "file:///project/contracts/b.tolk"
        const cUri = "file:///project/contracts/c.tolk"
        const dUri = "file:///project/contracts/d.tolk"

        index.withRoots([workspace])

        addParsed(index, aUri, parsed(aUri, "/project/contracts/a.tolk"))
        addParsed(
            index,
            bUri,
            parsed(bUri, "/project/contracts/b.tolk", ["/project/contracts/a.tolk"]),
        )
        addParsed(
            index,
            cUri,
            parsed(cUri, "/project/contracts/c.tolk", ["/project/contracts/b.tolk"]),
        )
        addParsed(index, dUri, parsed(dUri, "/project/contracts/d.tolk"))

        warm(workspace, aUri, 1)
        warm(workspace, bUri, 2)
        warm(workspace, cUri, 3)
        warm(workspace, dUri, 4)

        index.clearFileCaches(index.cacheInvalidationUris(workspace, aUri))

        expectCold(workspace, aUri)
        expectCold(workspace, bUri)
        expectCold(workspace, cUri)
        expectWarm(workspace, dUri)
    })

    it("updates import graph without keeping stale importer edges", () => {
        const index = new GlobalIndex()
        const workspace = new IndexRoot("workspace", "file:///project")
        const aUri = "file:///project/contracts/a.tolk"
        const bUri = "file:///project/contracts/b.tolk"
        const cUri = "file:///project/contracts/c.tolk"
        const importerUri = "file:///project/contracts/importer.tolk"

        index.withRoots([workspace])

        addParsed(index, aUri, parsed(aUri, "/project/contracts/a.tolk"))
        addParsed(index, bUri, parsed(bUri, "/project/contracts/b.tolk"))
        addParsed(index, cUri, parsed(cUri, "/project/contracts/c.tolk"))
        addParsed(
            index,
            importerUri,
            parsed(importerUri, "/project/contracts/importer.tolk", ["/project/contracts/a.tolk"]),
        )
        addParsed(
            index,
            importerUri,
            parsed(importerUri, "/project/contracts/importer.tolk", ["/project/contracts/b.tolk"]),
        )

        warm(workspace, aUri, 1)
        warm(workspace, bUri, 2)
        warm(workspace, cUri, 3)
        warm(workspace, importerUri, 4)

        index.clearFileCaches(index.cacheInvalidationUris(workspace, aUri))

        expectCold(workspace, aUri)
        expectWarm(workspace, importerUri)

        index.clearFileCaches(index.cacheInvalidationUris(workspace, bUri))

        expectCold(workspace, bUri)
        expectCold(workspace, importerUri)
        expectWarm(workspace, cUri)
    })

    it("removes importer edges when a file leaves the graph", () => {
        const index = new GlobalIndex()
        const workspace = new IndexRoot("workspace", "file:///project")
        const aUri = "file:///project/contracts/a.tolk"
        const importerUri = "file:///project/contracts/importer.tolk"

        index.withRoots([workspace])

        addParsed(index, aUri, parsed(aUri, "/project/contracts/a.tolk"))
        addParsed(
            index,
            importerUri,
            parsed(importerUri, "/project/contracts/importer.tolk", ["/project/contracts/a.tolk"]),
        )
        index.removeFromImportGraph(importerUri)

        warm(workspace, aUri, 1)
        warm(workspace, importerUri, 2)

        index.clearFileCaches(index.cacheInvalidationUris(workspace, aUri))

        expectCold(workspace, aUri)
        expectWarm(workspace, importerUri)
    })

    it("does not rescan parsed imports while computing invalidation", () => {
        const index = new GlobalIndex()
        const workspace = new IndexRoot("workspace", "file:///project")
        const aUri = "file:///project/contracts/a.tolk"
        const importerUri = "file:///project/contracts/importer.tolk"
        const importedFiles = jest.fn(() => ["/project/contracts/a.tolk"])
        const importer = {
            uri: importerUri,
            path: "/project/contracts/importer.tolk",
            importedFiles,
        } as unknown as TolkFile

        index.withRoots([workspace])
        addParsed(index, aUri, parsed(aUri, "/project/contracts/a.tolk"))
        addParsed(index, importerUri, importer)
        importedFiles.mockClear()

        const invalidatedUris = index.cacheInvalidationUris(workspace, aUri)

        expect(invalidatedUris).toContain(importerUri)
        expect(importedFiles).not.toHaveBeenCalled()
    })
})
