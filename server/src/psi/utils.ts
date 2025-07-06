//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"

export function parentOfType(node: SyntaxNode, ...types: readonly string[]): SyntaxNode | null {
    let parent = node.parent

    for (let i = 0; i < 100; i++) {
        if (parent === null) return null
        if (types.includes(parent.type)) return parent
        parent = parent.parent
    }

    return null
}

export function measureTime<T>(label: string, fn: () => T): T {
    const startTime = performance.now()
    const result = fn()
    const endTime = performance.now()
    const time = endTime - startTime
    if (time > 0.3) {
        console.info(`${label}: ${time}ms`)
    }
    return result
}
