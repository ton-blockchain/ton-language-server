//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

jest.mock("node:child_process", () => ({
    ...jest.requireActual<typeof import("node:child_process")>("node:child_process"),
    spawnSync: jest.fn(),
}))

import * as cp from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import {parseActonDoctorTolkVersion, resolveDisplayedTolkVersion} from "./ActonTolkVersion"

describe("Acton Tolk version resolution", () => {
    const tempDirs: string[] = []

    afterEach(() => {
        jest.restoreAllMocks()

        for (const dir of tempDirs.splice(0)) {
            fs.rmSync(dir, {recursive: true, force: true})
        }
    })

    it("parses the native Tolk version from acton doctor output", () => {
        const output = `
Native Libraries
tolk.load_ok:     true
tolk.version:     1.3.0
tolk.ton_commit_hash: dbf120b4d57e557a1602a95b5848e65ffc430094
`

        expect(parseActonDoctorTolkVersion(output)).toBe("1.3.0")
    })

    it("ignores missing or unavailable Acton Tolk versions", () => {
        const output = `
Native Libraries
tolk.load_ok:     false
tolk.version:     <n/a>
`

        expect(parseActonDoctorTolkVersion(output)).toBeNull()
    })

    it("prefers the Acton-managed Tolk version when Acton.toml is present", () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "acton-tolk-version-"))
        tempDirs.push(projectDir)
        fs.writeFileSync(path.join(projectDir, "Acton.toml"), "")

        const mockedSpawnSync = cp.spawnSync as jest.MockedFunction<typeof cp.spawnSync>
        mockedSpawnSync.mockReturnValue({
            pid: 1,
            output: [null, "tolk.load_ok: true\ntolk.version: 1.3.0\n", ""],
            stdout: "tolk.load_ok: true\ntolk.version: 1.3.0\n",
            stderr: "",
            status: 0,
            signal: null,
        } as cp.SpawnSyncReturns<string>)

        expect(
            resolveDisplayedTolkVersion(
                projectDir,
                {
                    number: "0.9.0",
                    commit: "deadbeef",
                },
                "acton",
            ),
        ).toEqual({
            number: "1.3.0",
            commit: "",
            source: "acton",
        })
    })

    it("falls back to the configured toolchain version outside Acton projects", () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "acton-tolk-version-"))
        tempDirs.push(projectDir)

        expect(
            resolveDisplayedTolkVersion(
                projectDir,
                {
                    number: "0.9.0",
                    commit: "deadbeef",
                },
                "acton",
            ),
        ).toEqual({
            number: "0.9.0",
            commit: "deadbeef",
            source: "toolchain",
        })
    })
})
