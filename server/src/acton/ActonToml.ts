//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as path from "node:path"
import * as fs from "node:fs"

import {URI} from "vscode-uri"

export interface WalletInfo {
    readonly name: string
    readonly isLocal: boolean
}

export class ActonToml {
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
        const content = this.readContent(this.uri)
        if (!content) return []

        const contractIds: string[] = []
        // Match [contracts.ID] where ID does not contain a dot
        const contractRegex = /^\[contracts\.([^\s.\]]+)]/gm
        let match: RegExpExecArray | null
        while ((match = contractRegex.exec(content)) !== null) {
            const id = match[1]
            if (id) {
                contractIds.push(id)
            }
        }
        return contractIds
    }

    public getMappings(): Map<string, string> {
        const content = this.readContent(this.uri)
        if (!content) return new Map()

        const mappings: Map<string, string> = new Map()
        // Simple manual parsing for [mappings] table
        const lines = content.split("\n")
        let inMappings = false
        for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed === "[mappings]") {
                inMappings = true
                continue
            }
            if (trimmed.startsWith("[") && trimmed !== "[mappings]") {
                inMappings = false
                continue
            }
            if (inMappings && trimmed.includes("=")) {
                const [rawKey, rawValue] = trimmed.split("=").map(s => s.trim())
                if (rawKey && rawValue) {
                    // remove quotes from key and then @ prefix
                    const cleanKey = rawKey.replace(/^["']|["']$/g, "")
                    const key = cleanKey.startsWith("@") ? cleanKey.slice(1) : cleanKey
                    // remove quotes from value
                    const cleanValue = rawValue.replace(/^["']|["']$/g, "")
                    mappings.set(key, cleanValue)
                }
            }
        }
        return mappings
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
        const wallets: WalletInfo[] = []
        // Match [wallets.NAME] where NAME does not contain a dot
        const walletRegex = /^\[wallets\.([^\s.\]]+)]/gm
        let match: RegExpExecArray | null
        while ((match = walletRegex.exec(content)) !== null) {
            const name = match[1]
            if (name) {
                wallets.push({name, isLocal})
            }
        }
        return wallets
    }

    public static discover(startUri: string): ActonToml | undefined {
        let currentPath = URI.parse(startUri).fsPath

        for (let i = 0; i < 10; i++) {
            const dir = path.dirname(currentPath)
            const tomlPath = path.join(dir, "Acton.toml")

            if (fs.existsSync(tomlPath)) {
                const tomlUri = URI.file(tomlPath).toString()
                return new ActonToml(tomlUri)
            }

            if (dir === currentPath) break
            currentPath = dir
        }
        return undefined
    }
}
