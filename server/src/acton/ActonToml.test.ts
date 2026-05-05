//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import {URI} from "vscode-uri"

import {ActonToml} from "./ActonToml"

describe("ActonToml", () => {
    const tempDirs: string[] = []

    afterEach(() => {
        ActonToml.clearCaches()

        for (const dir of tempDirs.splice(0)) {
            fs.rmSync(dir, {recursive: true, force: true})
        }
    })

    function createProject(): {projectDir: string; sourceUri: string; tomlUri: string} {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "acton-toml-"))
        tempDirs.push(projectDir)

        const contractsDir = path.join(projectDir, "contracts")
        fs.mkdirSync(contractsDir)

        return {
            projectDir,
            sourceUri: URI.file(path.join(contractsDir, "main.tolk")).toString(),
            tomlUri: URI.file(path.join(projectDir, "Acton.toml")).toString(),
        }
    }

    it("caches import mappings until Acton.toml caches are cleared", () => {
        const {projectDir, sourceUri, tomlUri} = createProject()
        const tomlPath = path.join(projectDir, "Acton.toml")
        fs.writeFileSync(tomlPath, '[import-mappings]\n"@foo" = "contracts"\n')

        const actonToml = ActonToml.discover(sourceUri)

        expect(actonToml?.getMappings().get("foo")).toBe("contracts")

        const mappings = actonToml?.getMappings()
        mappings?.set("foo", "mutated")

        expect(actonToml?.getMappings().get("foo")).toBe("contracts")

        fs.writeFileSync(tomlPath, '[import-mappings]\n"@foo" = "src"\n')

        expect(actonToml?.getMappings().get("foo")).toBe("contracts")

        ActonToml.clearCaches(tomlUri)

        expect(ActonToml.discover(sourceUri)?.getMappings().get("foo")).toBe("src")
    })

    it("invalidates cached missing Acton.toml discovery", () => {
        const {projectDir, sourceUri, tomlUri} = createProject()

        expect(ActonToml.discover(sourceUri)).toBeUndefined()

        fs.writeFileSync(path.join(projectDir, "Acton.toml"), '[import-mappings]\n"@foo" = "src"\n')

        expect(ActonToml.discover(sourceUri)).toBeUndefined()

        ActonToml.clearCaches(tomlUri)

        expect(ActonToml.discover(sourceUri)?.getMappings().get("foo")).toBe("src")
    })
})
