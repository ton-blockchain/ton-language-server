//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio

export interface VirtualFile {
    readonly uri: string
    readonly content: string
    readonly exists: boolean
}

export interface FileSystemProvider {
    readFile(uri: string): Promise<VirtualFile | null>
    exists(uri: string): Promise<boolean>
    listFiles(uri: string): Promise<string[]>
    listDirs(uri: string): Promise<string[]>
}
