//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core

import * as jsSHA from "jssha"

const bufferToBigInt = (buffer: Buffer): bigint =>
    buffer.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n)

/**
 * Computes SHA-256 hash of the given string
 * @param str - Input string
 * @returns 256-bit hash as bigint
 */
export function sha256(str: string): bigint {
    // @ts-expect-error strange bug
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const hasher: jsSHA.default = new jsSHA("SHA-256", "HEX")
    hasher.update(Buffer.from(str, "utf8").toString("hex"))
    const res = hasher.getHash("HEX")
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
