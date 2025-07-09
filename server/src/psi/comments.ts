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
        lines: finalComments.map(c =>
            trimPrefix(trimPrefix(trimPrefix(c.text, "///"), "//"), " ").trimEnd(),
        ),
        startPosition: asLspPosition(comments[0].startPosition),
    }
}

export function extractCommentsDoc(node: SyntaxNode): string {
    const content = extractCommentsDocContent(node)
    if (!content) return ""
    return content.lines.join("\n")
}
