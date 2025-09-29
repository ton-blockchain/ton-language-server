//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core

import * as crypto from "node:crypto"

const bufferToBigInt = (buffer: Buffer): bigint =>
    buffer.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n)

/**
 * Computes SHA-256 hash of the given string
 * @param str - Input string
 * @returns 256-bit hash as bigint
 */
export function sha256(str: string): bigint {
    const res = crypto.createHash("sha256").update(str).digest("hex")
    return bufferToBigInt(Buffer.from(res, "hex"))
}

/**
 * Computes first 32 bits of SHA-256 hash
 * @param str - Input string
 * @returns First 32 bits as number
 */
export function sha256_32(str: string): number {
    const fullHash = sha256(str)
    return Number(fullHash >> BigInt(224))
}
