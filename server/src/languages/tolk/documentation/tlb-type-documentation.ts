//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
interface TypeDoc {
    readonly range: string
    readonly size: string
    readonly description?: string
    readonly tlb?: string
}

const TYPE_DOCS: Record<string, TypeDoc | undefined> = {
    uint8: {range: "0 to 255 (2^8 - 1)", size: "8 bits = 1 byte"},
    uint16: {range: "0 to 65,535 (2^16 - 1)", size: "16 bits = 2 bytes"},
    uint32: {range: "0 to 4,294,967,295 (2^32 - 1)", size: "32 bits = 4 bytes"},
    uint64: {range: "0 to 2^64 - 1", size: "64 bits = 8 bytes"},
    uint128: {range: "0 to 2^128 - 1", size: "128 bits = 16 bytes"},
    uint256: {range: "0 to 2^256 - 1", size: "256 bits = 32 bytes"},

    int8: {range: "-128 to 127 (-2^7 to 2^7 - 1)", size: "8 bits = 1 byte"},
    int16: {range: "-32,768 to 32,767 (-2^15 to 2^15 - 1)", size: "16 bits = 2 bytes"},
    int32: {range: "-2^31 to 2^31 - 1", size: "32 bits = 4 bytes"},
    int64: {range: "-2^63 to 2^63 - 1", size: "64 bits = 8 bytes"},
    int128: {range: "-2^127 to 2^127 - 1", size: "128 bits = 16 bytes"},
    int256: {range: "-2^255 to 2^255 - 1", size: "256 bits = 32 bytes"},
    int257: {range: "-2^256 to 2^256 - 1", size: "257 bits = 32 bytes + 1 bit"},

    varuint16: {range: "0 to 2^120 - 1", size: "4 to 124 bits"},
    varint16: {range: "-2^119 to 2^119 - 1", size: "4 to 124 bits"},
    varuint32: {range: "0 to 2^248 - 1", size: "5 to 253 bits"},
    varint32: {range: "-2^247 to 2^247 - 1", size: "5 to 253 bits"},
}

function generateArbitraryIntDoc(type: string): TypeDoc | null {
    const match = /^(u?int)(\d+)$/.exec(type)
    if (!match) return null

    const [_, prefix, bits] = match
    const bitWidth = Number.parseInt(bits)

    if (prefix === "uint" && (bitWidth < 1 || bitWidth > 256)) return null
    if (prefix === "int" && (bitWidth < 1 || bitWidth > 257)) return null

    if (prefix === "uint") {
        return {
            range: `0 to 2^${bitWidth} - 1`,
            size: `${bitWidth} bits`,
            description: "Arbitrary bit-width unsigned integer type",
        }
    }

    return {
        range: `-2^${bitWidth - 1} to 2^${bitWidth - 1} - 1`,
        size: `${bitWidth} bits`,
        description: "Arbitrary bit-width signed integer type",
    }
}

export function generateTlBTypeDoc(word: string): string | null {
    const typeInfo: TypeDoc | null = TYPE_DOCS[word] ?? generateArbitraryIntDoc(word)
    if (!typeInfo) return null

    return `
- **Range**: ${typeInfo.range}
- **Size**: ${typeInfo.size}
- **TL-B**: ${typeInfo.tlb ?? word}${typeInfo.description ? `\n\n${typeInfo.description}` : ""}

`
}
