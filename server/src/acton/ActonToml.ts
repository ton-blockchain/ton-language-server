//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as path from "node:path"
import * as fs from "node:fs"

import {URI} from "vscode-uri"

import {parseStringTomlTable, parseTopLevelTomlTableKeys} from "@shared/acton-toml"

export interface WalletInfo {
    readonly name: string
    readonly isLocal: boolean
}

export class ActonToml {
    private static readonly discoveryCache: Map<string, ActonToml | undefined> = new Map()
    private static readonly contractIdsCache: Map<string, readonly string[]> = new Map()
    private static readonly mappingsCache: Map<string, ReadonlyMap<string, string>> = new Map()

    public constructor(private readonly uri: string) {}

    private readContent(uri: string): string | undefined {
        try {
            const fsPath = URI.parse(uri).fsPath
            return fs.readFileSync(fsPath, "utf8")
        } catch {
            return undefined
        }
    }

    public getContractIds(): string[] {
        const cached = ActonToml.contractIdsCache.get(this.uri)
        if (cached) return [...cached]

        const content = this.readContent(this.uri)
        if (!content) return []

        const contractIds = parseTopLevelTomlTableKeys(content, "contracts")
        ActonToml.contractIdsCache.set(this.uri, contractIds)
        return [...contractIds]
    }

    public getMappings(): Map<string, string> {
        const cached = ActonToml.mappingsCache.get(this.uri)
        if (cached) return new Map(cached)

        const content = this.readContent(this.uri)
        if (!content) return new Map()

        const mappings: Map<string, string> = new Map()
        const rawMappings = parseStringTomlTable(content, "import-mappings")
        for (const [rawKey, value] of rawMappings) {
            const key = rawKey.startsWith("@") ? rawKey.slice(1) : rawKey
            mappings.set(key, value)
        }

        ActonToml.mappingsCache.set(this.uri, mappings)
        return new Map(mappings)
    }

    public get workingDir(): string {
        return path.dirname(URI.parse(this.uri).fsPath)
    }

    public getWallets(): WalletInfo[] {
        const wallets: WalletInfo[] = []

        const baseUri = URI.parse(this.uri)
        const dirPath = path.dirname(baseUri.fsPath)

        const walletsTomlUri = URI.file(path.join(dirPath, "wallets.toml")).toString()
        const walletsContent = this.readContent(walletsTomlUri)
        if (walletsContent) {
            wallets.push(...this.parseWallets(walletsContent, true))
        }

        const globalWalletsTomlUri = URI.file(path.join(dirPath, "global.wallets.toml")).toString()
        const globalWalletsContent = this.readContent(globalWalletsTomlUri)
        if (globalWalletsContent) {
            wallets.push(...this.parseWallets(globalWalletsContent, false))
        }

        const seen: Set<string> = new Set()
        return wallets.filter(w => {
            if (seen.has(w.name)) return false
            seen.add(w.name)
            return true
        })
    }

    private parseWallets(content: string, isLocal: boolean): WalletInfo[] {
        return parseTopLevelTomlTableKeys(content, "wallets").map(name => ({name, isLocal}))
    }

    public static discover(startUri: string): ActonToml | undefined {
        if (this.discoveryCache.has(startUri)) {
            return this.discoveryCache.get(startUri)
        }

        let currentPath = URI.parse(startUri).fsPath

        for (let i = 0; i < 10; i++) {
            const dir = path.dirname(currentPath)
            const tomlPath = path.join(dir, "Acton.toml")

            if (fs.existsSync(tomlPath)) {
                const tomlUri = URI.file(tomlPath).toString()
                const actonToml = new ActonToml(tomlUri)
                this.discoveryCache.set(startUri, actonToml)
                return actonToml
            }

            if (dir === currentPath) break
            currentPath = dir
        }
        this.discoveryCache.set(startUri, undefined)
        return undefined
    }

    public static clearCaches(uri?: string): void {
        this.discoveryCache.clear()

        if (!uri) {
            this.contractIdsCache.clear()
            this.mappingsCache.clear()
            return
        }

        this.contractIdsCache.delete(uri)
        this.mappingsCache.delete(uri)
    }
}
