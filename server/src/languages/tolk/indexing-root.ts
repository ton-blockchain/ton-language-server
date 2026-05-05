//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {index} from "@server/languages/tolk/indexes"
import {findTolkFile} from "@server/files"
import {IndexingRoot, IndexingRootKind} from "@server/indexing/indexing"

export class TolkIndexingRoot extends IndexingRoot {
    public constructor(root: string, kind: IndexingRootKind, ignore: string[] = []) {
        super(root, ["tolk"], kind, ignore)
    }

    protected override async onFile(uri: string): Promise<void> {
        const file = await findTolkFile(uri)
        index.addFile(uri, file, false)
    }
}
