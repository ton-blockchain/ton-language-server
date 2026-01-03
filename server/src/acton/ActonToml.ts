//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as path from "node:path"

import {URI} from "vscode-uri"

import {readFileVFS, globalVFS, existsVFS} from "@server/vfs/files-adapter"

export interface WalletInfo {
    readonly name: string
    readonly isLocal: boolean
}

export class ActonToml {
    public constructor(private readonly uri: string) {}

    private async readContent(uri: string): Promise<string | undefined> {
        return readFileVFS(globalVFS, uri)
    }

    public async getContractIds(): Promise<string[]> {
        const content = await this.readContent(this.uri)
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

    public async getWallets(): Promise<WalletInfo[]> {
        const wallets: WalletInfo[] = []

        const baseUri = URI.parse(this.uri)
        const dirPath = path.dirname(baseUri.fsPath)

        const walletsTomlUri = URI.file(path.join(dirPath, "wallets.toml")).toString()
        const walletsContent = await this.readContent(walletsTomlUri)
        if (walletsContent) {
            // Match [wallets.NAME] where NAME does not contain a dot
            const walletRegex = /^\[wallets\.([^\s.\]]+)]/gm
            let match: RegExpExecArray | null
            while ((match = walletRegex.exec(walletsContent)) !== null) {
                const name = match[1]
                if (name) {
                    wallets.push({name, isLocal: true})
                }
            }
        }

        const globalWalletsTomlUri = URI.file(path.join(dirPath, "global.wallets.toml")).toString()
        const globalWalletsContent = await this.readContent(globalWalletsTomlUri)
        if (globalWalletsContent) {
            // Match [wallets.NAME] where NAME does not contain a dot
            const walletRegex = /^\[wallets\.([^\s.\]]+)]/gm
            let match: RegExpExecArray | null
            while ((match = walletRegex.exec(globalWalletsContent)) !== null) {
                const name = match[1]
                if (name) {
                    wallets.push({name, isLocal: false})
                }
            }
        }

        const seen: Set<string> = new Set()
        return wallets.filter(w => {
            if (seen.has(w.name)) return false
            seen.add(w.name)
            return true
        })
    }

    public static async find(startUri: string): Promise<ActonToml | undefined> {
        let currentPath = URI.parse(startUri).fsPath

        for (let i = 0; i < 10; i++) {
            const dir = path.dirname(currentPath)
            const tomlPath = path.join(dir, "Acton.toml")
            const tomlUri = URI.file(tomlPath).toString()

            if (await existsVFS(globalVFS, tomlUri)) {
                return new ActonToml(tomlUri)
            }

            if (dir === currentPath) break
            currentPath = dir
        }
        return undefined
    }
}
