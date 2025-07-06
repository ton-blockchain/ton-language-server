//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio

export type {FileSystemProvider, VirtualFile} from "./types"

export {createVFS, readFile, exists, listFiles} from "./vfs"
export type {VFS} from "./vfs"

export {createNodeFSProvider} from "./fs-provider"
export {createVSCodeProvider} from "./vscode-provider"

import {FileSystemProvider} from "./types"
import {createNodeFSProvider} from "./fs-provider"
import {createVSCodeProvider} from "./vscode-provider"

export function createDefaultProvider(): FileSystemProvider {
    return typeof process !== "undefined" && process.versions.node
        ? createNodeFSProvider()
        : createVSCodeProvider()
}
