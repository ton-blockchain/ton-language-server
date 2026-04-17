//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as cp from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import {TolkVersionInfo} from "@shared/shared-msgtypes"

interface BasicTolkVersionInfo {
    readonly number: string
    readonly commit: string
}

export function resolveDisplayedTolkVersion(
    projectRoot: string,
    toolchainVersion: BasicTolkVersionInfo,
    actonPath: string,
): TolkVersionInfo {
    const actonVersion = resolveActonProjectTolkVersion(projectRoot, actonPath)
    if (actonVersion) {
        return actonVersion
    }

    return {
        ...toolchainVersion,
        source: "toolchain",
    }
}

export function parseActonDoctorTolkVersion(output: string): string | null {
    const fields = parseActonDoctorFields(output)
    const loadOk = fields.get("tolk.load_ok")
    const version = fields.get("tolk.version")?.trim()

    if (loadOk === "false") {
        return null
    }

    if (!version || version.startsWith("<")) {
        return null
    }

    return version
}

function resolveActonProjectTolkVersion(
    projectRoot: string,
    actonPath: string,
): TolkVersionInfo | null {
    const manifestPath = path.join(projectRoot, "Acton.toml")
    if (!fs.existsSync(manifestPath)) {
        return null
    }

    const resolvedActonPath = actonPath.trim() === "" ? "acton" : actonPath

    try {
        const result = cp.spawnSync(
            resolvedActonPath,
            ["doctor", "--manifest-path", manifestPath],
            {
                encoding: "utf8",
                env: {
                    ...process.env,
                    ACTON_LOG_DIR: process.env.ACTON_LOG_DIR ?? os.tmpdir(),
                },
                maxBuffer: 10 * 1024 * 1024,
                timeout: 5000,
                windowsHide: true,
            },
        )

        if (result.error || result.status !== 0) {
            return null
        }

        const version = parseActonDoctorTolkVersion(`${result.stdout}\n${result.stderr}`)
        if (!version) {
            return null
        }

        return {
            number: version,
            commit: "",
            source: "acton",
        }
    } catch {
        return null
    }
}

function parseActonDoctorFields(output: string): Map<string, string> {
    const fields: Map<string, string> = new Map()

    for (const rawLine of output.split(/\r?\n/u)) {
        const line = rawLine.trim()
        const match = /^([a-z0-9_.-]+):\s+(.*)$/iu.exec(line)
        if (!match) {
            continue
        }

        const [, key, value] = match
        fields.set(key, value.trim())
    }

    return fields
}
