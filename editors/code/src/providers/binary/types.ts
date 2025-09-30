import {Address, BitReader, BitString, Cell, ExternalAddress, Slice} from "@ton/core"
import {paddedBufferToBits} from "@ton/core/dist/boc/utils/paddedBits"

export type ParsedObject = Record<string, ParsedSlice | undefined>

export interface NestedObject {
    readonly $: "nested-object"
    readonly name: string
    readonly value: ParsedObject | undefined
}

export type ParsedSlice = Readonly<
    bigint | Address | ExternalAddress | AddressNone | Cell | Slice | NestedObject | boolean | null
>

export class AddressNone {
    public toString(): string {
        return "addr_none"
    }
}

export function convertBinSliceToHex(binSlice: string): string {
    const binBits = binSlice.slice(2, -1)
    let hexBits = "x{"
    for (let i = 0; i < binBits.length; i += 4) {
        if (i + 4 <= binBits.length) {
            hexBits += Number.parseInt(binBits.slice(i, i + 4), 2)
                .toString(16)
                .toUpperCase()
        } else {
            let padded = binBits.slice(i) + "1"
            padded = padded.padEnd(Math.floor((padded.length + 3) / 4) * 4, "0")
            hexBits += Number.parseInt(padded, 2).toString(16).toUpperCase()
            hexBits += "_"
        }
    }
    hexBits += "}"
    return hexBits
}

export function makeSlice(hexOrBin: string, refs: Cell[] = []): Slice {
    let hex = hexOrBin.startsWith("b{") ? convertBinSliceToHex(hexOrBin) : hexOrBin
    if (hex.startsWith("x{")) {
        hex = hex.slice(2, -1)
    }

    let br: BitReader
    if (hex.endsWith("_")) {
        hex = hex.slice(0, Math.max(0, hex.length - 1))
        if (hex.length % 2) hex += "0"
        br = new BitReader(paddedBufferToBits(Buffer.from(hex, "hex")))
    } else {
        let paddedBy0 = false
        if (hex.length % 2) {
            hex += "0"
            paddedBy0 = true
        }
        br = new BitReader(
            new BitString(Buffer.from(hex, "hex"), 0, hex.length * 4 - (paddedBy0 ? 4 : 0)),
        )
    }
    return new Slice(br, refs)
}
