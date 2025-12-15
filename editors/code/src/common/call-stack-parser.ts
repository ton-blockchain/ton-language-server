export interface CallStackEntry {
    readonly function: string
    readonly file?: string
    readonly line?: number
    readonly column?: number
}

export function parseCallStack(callStack: string | undefined): CallStackEntry[] {
    if (!callStack) {
        return []
    }

    const lines = callStack.split("\n").filter(line => line.trim().startsWith("at "))
    const entries: CallStackEntry[] = []

    for (const line of lines) {
        const trimmed = line.trim()
        const entry = parseStackLine(trimmed)
        if (entry) {
            entries.push(entry)
        }
    }

    return entries
}

function parseStackLine(line: string): CallStackEntry | null {
    const withoutAt = line.startsWith("at ") ? line.slice(3).trim() : line.trim()

    if (!withoutAt) {
        return {function: ""}
    }

    // Handle different formats:
    // 1. function (file:line:column)
    // 2. file:line:column
    // 3. function

    const parenIndex = withoutAt.indexOf("(")
    const lastParenIndex = withoutAt.lastIndexOf(")")

    if (parenIndex !== -1 && lastParenIndex !== -1 && lastParenIndex > parenIndex) {
        // Format: function (file:line:column) [extra info]
        const functionName = withoutAt.slice(0, parenIndex).trim()
        const locationAndExtra = withoutAt.slice(parenIndex + 1, lastParenIndex).trim()

        const locationEnd = locationAndExtra.indexOf(" (")
        const location =
            locationEnd === -1 ? locationAndExtra : locationAndExtra.slice(0, locationEnd)

        const locationParts = parseLocation(location)
        return {
            function: functionName,
            ...locationParts,
        }
    } else {
        // Format: file:line:column or just function
        // Check if it looks like a file path (contains / or \ or has extension or starts with known schemes)
        const firstPart = withoutAt.split(":")[0]
        if (
            withoutAt.includes("/") ||
            withoutAt.includes("\\") ||
            /\.\w+$/.test(firstPart) ||
            firstPart.includes("node:") ||
            firstPart.startsWith("file://") ||
            /^\w+:/.test(withoutAt)
        ) {
            const locationParts = parseLocation(withoutAt)
            return {
                function: "",
                ...locationParts,
            }
        } else {
            return {
                function: withoutAt,
            }
        }
    }
}

function parseLocation(location: string): {file?: string; line?: number; column?: number} {
    // Handle cases like:
    // /path/to/file.js:123:45
    // node:internal/process/task_queues:105:5
    // C:\path\to\file.js:123:45

    const parts = location.split(":")
    if (parts.length >= 3) {
        const columnStr = parts.at(-1) ?? ""
        const lineStr = parts.at(-2) ?? ""
        const column = Number.parseInt(columnStr, 10)
        const line = Number.parseInt(lineStr, 10)

        if (!Number.isNaN(column) && !Number.isNaN(line)) {
            const file = parts.slice(0, -2).join(":")
            return {
                file,
                line,
                column,
            }
        }
    }

    if (parts.length >= 2) {
        const lineStr = parts.at(-1) ?? ""
        const line = Number.parseInt(lineStr, 10)

        if (!Number.isNaN(line)) {
            const file = parts.slice(0, -1).join(":")
            return {
                file,
                line,
            }
        }
    }

    return {
        file: location,
    }
}
