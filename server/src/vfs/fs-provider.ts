//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio

/* eslint-disable @typescript-eslint/require-await */
import {readFileSync, existsSync, readdirSync, statSync} from "node:fs"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {FileSystemProvider, VirtualFile} from "./types"

export function createNodeFSProvider(): FileSystemProvider {
    return {
        async readFile(uri: string): Promise<VirtualFile | null> {
            try {
                const filePath = fileURLToPath(uri)
                const content = readFileSync(filePath, "utf8")

                return {
                    uri,
                    content,
                    exists: true,
                }
            } catch {
                return {
                    uri,
                    content: "",
                    exists: false,
                }
            }
        },

        async exists(uri: string): Promise<boolean> {
            try {
                const filePath = fileURLToPath(uri)
                return existsSync(filePath)
            } catch {
                return false
            }
        },

        async listFiles(uri: string): Promise<string[]> {
            try {
                const dirPath = fileURLToPath(uri)
                const entries = readdirSync(dirPath)

                const files: string[] = []

                for (const entry of entries) {
                    const fullPath = join(dirPath, entry)
                    const stat = statSync(fullPath)

                    if (stat.isFile()) {
                        files.push(entry)
                    }
                }

                return files
            } catch {
                return []
            }
        },

        async listDirs(uri: string): Promise<string[]> {
            try {
                const dirPath = fileURLToPath(uri)
                const entries = readdirSync(dirPath)

                const files: string[] = []

                for (const entry of entries) {
                    const fullPath = join(dirPath, entry)
                    const stat = statSync(fullPath)

                    if (stat.isDirectory()) {
                        files.push(entry)
                    }
                }

                return files
            } catch {
                return []
            }
        },
    }
}
