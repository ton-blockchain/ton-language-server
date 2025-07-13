export function trimBackticks(text: string): string {
    if (text.startsWith("`") && text.endsWith("`")) {
        return text.slice(1, -1)
    }
    return text
}

export const KEYWORDS = new Set([
    "tolk",
    "import",
    "global",
    "const",
    "type",
    "struct",
    "fun",
    "get",
    "mutate",
    "asm",
    "builtin",
    "var",
    "val",
    "return",
    "repeat",
    "if",
    "else",
    "do",
    "while",
    "break",
    "continue",
    "throw",
    "assert",
    "try",
    "catch",
    "lazy",
    "is",
    "!is",
    "match",
    "true",
    "false",
    "null",
])
