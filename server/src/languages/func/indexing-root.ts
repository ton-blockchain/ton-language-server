//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {index} from "@server/languages/func/indexes"
import {findFuncFile} from "@server/files"
import {IndexingRoot, IndexingRootKind} from "@server/indexing/indexing"

export class FuncIndexingRoot extends IndexingRoot {
    public constructor(root: string, kind: IndexingRootKind) {
        super(root, ["fc", "func"], kind)
    }

    protected override async onFile(uri: string): Promise<void> {
        const file = await findFuncFile(uri)
        index.addFile(uri, file, false)
    }
}
