//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio

/* eslint-disable @typescript-eslint/require-await */
import {FileSystemProvider, VirtualFile} from "./types"

export function createVSCodeProvider(): FileSystemProvider {
    return {
        async readFile(_uri: string): Promise<VirtualFile | null> {
            return null
        },
        async exists(_uri: string): Promise<boolean> {
            return false
        },
        async listFiles(_uri: string): Promise<string[]> {
            return []
        },
        async listDirs(_uri: string): Promise<string[]> {
            return []
        },
    }
}
