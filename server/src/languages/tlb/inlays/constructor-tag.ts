//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core

const SHORT_TAG_MASK = (1n << 59n) - 1n
const TAG_MASK = (1n << 63n) - 1n
const HEX = "0123456789abcdef"

export class ConstructorTag {
    public constructor(public readonly value: bigint) {}

    public toString(): string {
        if (this.value === 0n) {
            return "$_"
        }

        let tag = this.value
        if ((SHORT_TAG_MASK & tag) === 0n) {
            let result = "$"
            let c = 0
            while ((tag & TAG_MASK) !== 0n) {
                result += ((tag >> 63n) & 1n).toString()
                tag <<= 1n
                c++
            }
            if (c === 0) {
                result += "_"
            }
            return result
        } else {
            let result = "#"
            while ((tag & TAG_MASK) !== 0n) {
                result += HEX[Number((tag >> 60n) & 15n)]
                tag <<= 4n
            }
            if (tag === 0n) {
                result += "_"
            }
            return result
        }
    }
}
