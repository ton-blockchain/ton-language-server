//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
export function trimSuffix(text: string, prefix: string): string {
    if (text.endsWith(prefix)) {
        return text.slice(0, -prefix.length)
    }
    return text
}

export function trimPrefix(text: string, prefix: string): string {
    if (text.startsWith(prefix)) {
        return text.slice(prefix.length)
    }
    return text
}

/**
 * Converts any case (snake_case, kebab-case, camelCase) to PascalCase
 */
export function toPascalCase(text: string): string {
    const withSpaces = text.replace(/[_-]/g, " ")
    const normalized = withSpaces.replace(/([A-Z])/g, " $1")
    return normalized
        .split(" ")
        .filter(word => word.length > 0)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join("")
}

export function normalizeIndentation(input: string): string {
    const lines = input.split("\n")
    if (lines.length <= 1) return input

    const indents = lines
        .slice(1)
        .filter(line => line.trim().length > 0)
        .map(line => /^\s*/.exec(line)?.[0]?.length ?? 0)
    const minIndent = Math.min(...indents)

    if (minIndent === 0) {
        return input
    }

    return lines
        .map((line, index) => {
            if (index === 0) return line
            if (minIndent > line.length) {
                return line.trimStart()
            }
            return line.slice(minIndent)
        })
        .join("\n")
}
