import {GlobalIndex, IndexRoot} from "./index"

function warm(root: IndexRoot, key: number): void {
    root.cache.typeCache.setValue(key, null)
}

function expectWarm(root: IndexRoot): void {
    expect(root.cache.typeCache.size).toBe(1)
}

function expectCold(root: IndexRoot): void {
    expect(root.cache.typeCache.size).toBe(0)
}

describe("GlobalIndex scoped cache invalidation", () => {
    let consoleInfoSpy: jest.SpyInstance

    beforeEach(() => {
        consoleInfoSpy = jest.spyOn(console, "info").mockImplementation()
    })

    afterEach(() => {
        consoleInfoSpy.mockRestore()
    })

    it("keeps library roots warm after workspace changes", () => {
        const index = new GlobalIndex()
        const stdlib = new IndexRoot("stdlib", "file:///project/.acton/tolk-stdlib")
        const acton = new IndexRoot("acton", "file:///project/.acton")
        const workspace = new IndexRoot("workspace", "file:///project")

        index.withStdlibRoot(stdlib)
        index.withRoots([acton, workspace])

        warm(stdlib, 1)
        warm(acton, 2)
        warm(workspace, 3)

        workspace.clearOwnCache()
        index.clearRootsDependentOn(workspace)

        expectWarm(stdlib)
        expectWarm(acton)
        expectCold(workspace)
    })

    it("clears workspace root after Acton root changes", () => {
        const index = new GlobalIndex()
        const stdlib = new IndexRoot("stdlib", "file:///project/.acton/tolk-stdlib")
        const acton = new IndexRoot("acton", "file:///project/.acton")
        const workspace = new IndexRoot("workspace", "file:///project")

        index.withStdlibRoot(stdlib)
        index.withRoots([acton, workspace])

        warm(stdlib, 1)
        warm(acton, 2)
        warm(workspace, 3)

        acton.clearOwnCache()
        index.clearRootsDependentOn(acton)

        expectWarm(stdlib)
        expectCold(acton)
        expectCold(workspace)
    })

    it("clears Acton and workspace roots after stdlib changes", () => {
        const index = new GlobalIndex()
        const stdlib = new IndexRoot("stdlib", "file:///project/.acton/tolk-stdlib")
        const acton = new IndexRoot("acton", "file:///project/.acton")
        const workspace = new IndexRoot("workspace", "file:///project")

        index.withStdlibRoot(stdlib)
        index.withRoots([acton, workspace])

        warm(stdlib, 1)
        warm(acton, 2)
        warm(workspace, 3)

        stdlib.clearOwnCache()
        index.clearRootsDependentOn(stdlib)

        expectCold(stdlib)
        expectCold(acton)
        expectCold(workspace)
    })
})
