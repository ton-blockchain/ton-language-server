export function trimBackticks(text: string): string {
    if (text.startsWith("`") && text.endsWith("`")) {
        return text.slice(1, -1)
    }
    return text
}
