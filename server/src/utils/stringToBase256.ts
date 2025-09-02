//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core

/**
 * Converts ASCII string to base-256 number
 * Takes N-chars ascii string and interprets it as a number in base 256.
 * Example: stringToBase256("AB") = 16706 (65*256 + 66)
 *
 * @param str - Input ASCII string
 * @returns Number representation in base 256
 */
export function stringToBase256(str: string): bigint {
    let result = BigInt(0)
    const encoder = new TextEncoder()
    const bytes = encoder.encode(str)

    for (const byte of bytes) {
        result = result * BigInt(256) + BigInt(byte)
    }

    return result
}
