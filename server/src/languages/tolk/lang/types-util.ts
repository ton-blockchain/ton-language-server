export function bitTypeName(name: string): string | undefined {
    if (name === "int") return undefined // fast path

    if (
        name.startsWith("int") ||
        name.startsWith("uint") ||
        name.startsWith("bits") ||
        name.startsWith("bytes")
    ) {
        const match = /^((u?int)|bits|bytes)(\d+)$/.exec(name)
        if (!match) return undefined

        const [_, prefix] = match
        return prefix + "N"
    }

    return undefined
}
