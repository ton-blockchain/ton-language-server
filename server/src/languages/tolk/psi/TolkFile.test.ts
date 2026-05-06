import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import type {Node as SyntaxNode, Tree} from "web-tree-sitter"
import {URI} from "vscode-uri"

import {ActonToml} from "@server/acton/ActonToml"

import {TolkFile} from "./TolkFile"

describe("TolkFile imports", () => {
    let projectDir = ""

    beforeEach(() => {
        ActonToml.clearCaches()
        projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "tolk-file-imports-"))
        fs.mkdirSync(path.join(projectDir, "contracts"), {recursive: true})
        fs.writeFileSync(
            path.join(projectDir, "Acton.toml"),
            '[import-mappings]\n"@contracts" = "contracts"\n',
        )
    })

    afterEach(() => {
        ActonToml.clearCaches()
        if (projectDir !== "") {
            fs.rmSync(projectDir, {recursive: true, force: true})
        }
    })

    it("treats mapped and local imports resolving to the same file as already imported", () => {
        const file = createTolkFile(path.join(projectDir, "contracts", "main.tolk"), ['"errors"'])

        expect(file.alreadyImport("@contracts/errors")).toBe(true)
    })

    it("does not treat different resolved imports as already imported", () => {
        const file = createTolkFile(path.join(projectDir, "contracts", "main.tolk"), ['"messages"'])

        expect(file.alreadyImport("@contracts/errors")).toBe(false)
    })

    it("deduplicates imported files that resolve through different import paths", () => {
        const file = createTolkFile(path.join(projectDir, "contracts", "main.tolk"), [
            '"errors"',
            '"@contracts/errors"',
        ])

        expect(file.importedFiles()).toEqual([path.join(projectDir, "contracts", "errors.tolk")])
    })
})

function createTolkFile(filePath: string, importPaths: readonly string[]): TolkFile {
    return new TolkFile(
        URI.file(filePath).toString(),
        createTree(importPaths),
        importPaths.map(importPath => `import ${importPath}`).join("\n"),
    )
}

function createTree(importPaths: readonly string[]): Tree {
    const rootNode = {
        children: importPaths.map(importPath => createImportNode(importPath)),
    }

    return {rootNode} as unknown as Tree
}

function createImportNode(importPath: string): SyntaxNode {
    const pathNode = {text: importPath}
    return {
        type: "import_directive",
        childForFieldName: (fieldName: string) => (fieldName === "path" ? pathNode : null),
    } as unknown as SyntaxNode
}
