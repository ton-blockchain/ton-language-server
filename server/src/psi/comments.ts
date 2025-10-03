import type {Node as SyntaxNode} from "web-tree-sitter"
import {Position} from "vscode-languageclient"

import {trimPrefix} from "@server/utils/strings"
import {asLspPosition} from "@server/utils/position"

export function extractCommentsDocContent(node: SyntaxNode): {
    lines: string[]
    startPosition: Position
} | null {
    const prevSibling = node.previousSibling
    if (!prevSibling || prevSibling.type !== "comment") return null

    const nodeStartLine = node.startPosition.row

    const comments: SyntaxNode[] = []
    let comment: SyntaxNode | null = prevSibling
    while (comment?.type === "comment") {
        const commentStartLine = comment.startPosition.row

        if (commentStartLine + 1 + comments.length != nodeStartLine) {
            break
        }

        // possibly inline comment
        const prev = comment.previousSibling
        if (prev?.endPosition.row === commentStartLine) {
            // same line with the previous node, inline comment
            break
        }

        comments.push(comment)
        comment = comment.previousSibling
    }

    if (comments.length === 0) return null

    const finalComments = comments.reverse()

    return {
        lines: finalComments.map(c => normalizeRawComment(c)),
        startPosition: asLspPosition(comments[0].startPosition),
    }
}

function findInlineComment(node: SyntaxNode): SyntaxNode | null {
    const nextSibling = node.nextSibling
    if (nextSibling?.type === "comment") {
        return nextSibling
    }

    if (nextSibling?.type === ",") {
        // foo: int, // comment
        //         ^ ^
        //         | nextNextSibling
        //         |
        //         nextSibling
        const nextNextSibling = nextSibling.nextSibling
        if (nextNextSibling?.type === "comment") {
            return nextNextSibling
        }
    }

    return null
}

export function extractInlineDocCommentContent(node: SyntaxNode): {
    lines: string[]
    startPosition: Position
} | null {
    const inlineComment = findInlineComment(node)
    if (!inlineComment) return null
    return {
        lines: [normalizeRawComment(inlineComment)],
        startPosition: asLspPosition(inlineComment.startPosition),
    }
}

export function extractCommentsDoc(node: SyntaxNode): string {
    const content = extractCommentsDocContent(node)
    if (!content) {
        const inlineContent = extractInlineDocCommentContent(node)
        if (inlineContent) {
            return inlineContent.lines.join("\n")
        }
        return ""
    }
    return content.lines.join("\n")
}

function normalizeRawComment(c: SyntaxNode): string {
    const text = c.text
    if (text.startsWith("/*") && text.endsWith("*/")) {
        return text.slice(2, -2).trim()
    }
    return trimPrefix(trimPrefix(trimPrefix(trimPrefix(text, ";;;"), "///"), "//"), " ").trimEnd()
}
