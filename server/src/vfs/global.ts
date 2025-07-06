//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {createVFS, createDefaultProvider, VFS} from "./index"

export const globalVFS: VFS = createVFS(createDefaultProvider())
