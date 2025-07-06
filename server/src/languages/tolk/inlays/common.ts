//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {TolkNode} from "@server/languages/tolk/psi/TolkNode"
import {Location} from "vscode-languageclient"
import {URI} from "vscode-uri"
import {asLspRange} from "@server/utils/position"

export function toLocation(node: TolkNode | null | undefined): Location | undefined {
    if (!node) return undefined

    return {
        uri: URI.parse(node.file.uri).toString(true),
        range: asLspRange(node.node),
    }
}
