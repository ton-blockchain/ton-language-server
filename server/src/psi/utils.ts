//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type { Node as SyntaxNode } from "web-tree-sitter"

export function parentOfType(node: SyntaxNode, ...types: readonly string[]): SyntaxNode | null {
    let parent = node.parent

    for (let i = 0; i < 100; i++) {
        if (parent === null) return null
        if (types.includes(parent.type)) return parent
        parent = parent.parent
    }

    return null
}
export function parentOfTypeWithCb<T>(node: SyntaxNode, cb: (parent: SyntaxNode, branch: SyntaxNode) => T, ...types: readonly string[]): T | null {
    let parent = node.parent;
    let prevNode = node;

    for (let i = 0; i < 100; i++) {
        if (parent === null) return null
        if (types.includes(parent.type)) return cb(parent, prevNode)
        prevNode = parent;
        parent = parent.parent
    }

    return null
}
export function closestNamedSibling(node: SyntaxNode, direction: 'prev' | 'next', cb: (sibling: SyntaxNode) => boolean): SyntaxNode | null {
    let curSibling = direction == 'prev' ? node.previousNamedSibling : node.nextNamedSibling;
    while (curSibling) {
        if (cb(curSibling)) {
            return curSibling;
        }
        curSibling = direction == 'prev' ? curSibling.previousNamedSibling : curSibling.nextNamedSibling;
    }
    return null;
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
