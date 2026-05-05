import * as path from "node:path"
import {pathToFileURL} from "node:url"

import {TOLK_PARSED_FILES_CACHE} from "@server/files"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"

import {GlobalIndex, IndexRoot} from "./index"

const PROJECT_ROOT = path.resolve("test-project")

function testPath(...parts: string[]): string {
    return path.join(PROJECT_ROOT, ...parts)
}

function testUri(...parts: string[]): string {
    return pathToFileURL(testPath(...parts)).toString()
}

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

    it("keeps stdlib before stubs in global root order", () => {
        const index = new GlobalIndex()
        const stdlib = new IndexRoot("stdlib", testUri(".acton", "tolk-stdlib"))
        const stubs = new IndexRoot("stubs", testUri("stubs"))
        const workspace = new IndexRoot("workspace", testUri())

        index.withStdlibRoot(stdlib)
        index.withStubsRoot(stubs)
        index.withRoots([workspace])

        expect(index.allRoots()).toEqual([stdlib, stubs, workspace])
    })

    it("keeps library roots warm after workspace changes", () => {
        const index = new GlobalIndex()
        const stdlib = new IndexRoot("stdlib", testUri(".acton", "tolk-stdlib"))
        const acton = new IndexRoot("acton", testUri(".acton"))
        const workspace = new IndexRoot("workspace", testUri())
        const stdlibUri = testUri(".acton", "tolk-stdlib", "common.tolk")
        const actonUri = testUri(".acton", "wrapper.tolk")
        const workspaceUri = testUri("contracts", "main.tolk")

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
        const stdlib = new IndexRoot("stdlib", testUri(".acton", "tolk-stdlib"))
        const acton = new IndexRoot("acton", testUri(".acton"))
        const workspace = new IndexRoot("workspace", testUri())
        const stdlibUri = testUri(".acton", "tolk-stdlib", "common.tolk")
        const actonUri = testUri(".acton", "wrapper.tolk")
        const workspaceUri = testUri("contracts", "main.tolk")

        index.withStdlibRoot(stdlib)
        index.withRoots([acton, workspace])

        addParsed(
            index,
            workspaceUri,
            parsed(workspaceUri, testPath("contracts", "main.tolk"), [
                testPath(".acton", "wrapper.tolk"),
            ]),
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
        const stdlib = new IndexRoot("stdlib", testUri(".acton", "tolk-stdlib"))
        const acton = new IndexRoot("acton", testUri(".acton"))
        const workspace = new IndexRoot("workspace", testUri())
        const stdlibUri = testUri(".acton", "tolk-stdlib", "common.tolk")
        const actonUri = testUri(".acton", "wrapper.tolk")
        const workspaceUri = testUri("contracts", "main.tolk")

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
        const stdlib = new IndexRoot("stdlib", testUri(".acton", "tolk-stdlib"))
        const acton = new IndexRoot("acton", testUri(".acton"))
        const workspace = new IndexRoot("workspace", testUri())
        const stdlibUri = testUri(".acton", "tolk-stdlib", "math.tolk")
        const actonUri = testUri(".acton", "wrapper.tolk")
        const workspaceUri = testUri("contracts", "main.tolk")
        const unrelatedUri = testUri("contracts", "unrelated.tolk")

        index.withStdlibRoot(stdlib)
        index.withRoots([acton, workspace])

        addParsed(
            index,
            stdlibUri,
            parsed(stdlibUri, testPath(".acton", "tolk-stdlib", "math.tolk")),
        )
        addParsed(
            index,
            actonUri,
            parsed(actonUri, testPath(".acton", "wrapper.tolk"), [
                testPath(".acton", "tolk-stdlib", "math.tolk"),
            ]),
        )
        addParsed(
            index,
            workspaceUri,
            parsed(workspaceUri, testPath("contracts", "main.tolk"), [
                testPath(".acton", "wrapper.tolk"),
            ]),
        )
        addParsed(
            index,
            unrelatedUri,
            parsed(unrelatedUri, testPath("contracts", "unrelated.tolk")),
        )

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
        const workspace = new IndexRoot("workspace", testUri())
        const aUri = testUri("contracts", "a.tolk")
        const bUri = testUri("contracts", "b.tolk")
        const cUri = testUri("contracts", "c.tolk")
        const dUri = testUri("contracts", "d.tolk")

        index.withRoots([workspace])

        addParsed(index, aUri, parsed(aUri, testPath("contracts", "a.tolk")))
        addParsed(
            index,
            bUri,
            parsed(bUri, testPath("contracts", "b.tolk"), [testPath("contracts", "a.tolk")]),
        )
        addParsed(
            index,
            cUri,
            parsed(cUri, testPath("contracts", "c.tolk"), [testPath("contracts", "b.tolk")]),
        )
        addParsed(index, dUri, parsed(dUri, testPath("contracts", "d.tolk")))

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
        const workspace = new IndexRoot("workspace", testUri())
        const aUri = testUri("contracts", "a.tolk")
        const bUri = testUri("contracts", "b.tolk")
        const cUri = testUri("contracts", "c.tolk")
        const importerUri = testUri("contracts", "importer.tolk")

        index.withRoots([workspace])

        addParsed(index, aUri, parsed(aUri, testPath("contracts", "a.tolk")))
        addParsed(index, bUri, parsed(bUri, testPath("contracts", "b.tolk")))
        addParsed(index, cUri, parsed(cUri, testPath("contracts", "c.tolk")))
        addParsed(
            index,
            importerUri,
            parsed(importerUri, testPath("contracts", "importer.tolk"), [
                testPath("contracts", "a.tolk"),
            ]),
        )
        addParsed(
            index,
            importerUri,
            parsed(importerUri, testPath("contracts", "importer.tolk"), [
                testPath("contracts", "b.tolk"),
            ]),
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
        const workspace = new IndexRoot("workspace", testUri())
        const aUri = testUri("contracts", "a.tolk")
        const importerUri = testUri("contracts", "importer.tolk")

        index.withRoots([workspace])

        addParsed(index, aUri, parsed(aUri, testPath("contracts", "a.tolk")))
        addParsed(
            index,
            importerUri,
            parsed(importerUri, testPath("contracts", "importer.tolk"), [
                testPath("contracts", "a.tolk"),
            ]),
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
        const workspace = new IndexRoot("workspace", testUri())
        const aUri = testUri("contracts", "a.tolk")
        const importerUri = testUri("contracts", "importer.tolk")
        const importedFiles = jest.fn(() => [testPath("contracts", "a.tolk")])
        const importer = {
            uri: importerUri,
            path: testPath("contracts", "importer.tolk"),
            importedFiles,
        } as unknown as TolkFile

        index.withRoots([workspace])
        addParsed(index, aUri, parsed(aUri, testPath("contracts", "a.tolk")))
        addParsed(index, importerUri, importer)
        importedFiles.mockClear()

        const invalidatedUris = index.cacheInvalidationUris(workspace, aUri)

        expect(invalidatedUris).toContain(importerUri)
        expect(importedFiles).not.toHaveBeenCalled()
    })

    it("reuses root lookup for indexed file lookups", () => {
        const index = new GlobalIndex()
        const workspace = new IndexRoot("workspace", testUri())
        const uri = testUri("contracts", "main.tolk")
        const file = {
            uri,
            path: testPath("contracts", "main.tolk"),
            importedFiles: () => [],
            rootNode: {children: []},
        } as unknown as TolkFile

        index.withRoots([workspace])
        index.addFile(uri, file, false)

        const containsSpy = jest.spyOn(workspace, "contains")

        expect(index.findFile(uri)).toBeDefined()
        expect(index.findFile(uri)).toBeDefined()
        expect(containsSpy).not.toHaveBeenCalled()

        containsSpy.mockRestore()
    })
})
