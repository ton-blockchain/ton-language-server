//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {FileSystemProvider, VirtualFile} from "./types"

export interface VFS {
    readonly provider: FileSystemProvider
}

export function createVFS(provider: FileSystemProvider): VFS {
    return {provider}
}

export async function readFile(vfs: VFS, uri: string): Promise<VirtualFile | null> {
    return vfs.provider.readFile(uri)
}

export async function exists(vfs: VFS, uri: string): Promise<boolean> {
    return vfs.provider.exists(uri)
}

export async function listFiles(vfs: VFS, uri: string): Promise<string[]> {
    return vfs.provider.listFiles(uri)
}

export async function listDirs(vfs: VFS, uri: string): Promise<string[]> {
    return vfs.provider.listDirs(uri)
}
