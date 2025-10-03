import {Address, BitReader, BitString, Cell, ExternalAddress, Slice} from "@ton/core"
import {paddedBufferToBits} from "@ton/core/dist/boc/utils/paddedBits"

export type ParsedObject = Record<string, ParsedSlice | undefined>

export interface NestedObject {
    readonly $: "nested-object"
    readonly name: string
    readonly value: ParsedObject | undefined
}

export type FlattenParsedObject = Record<string, ParsedSlice | undefined>

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

function isNestedObject(obj: unknown): obj is NestedObject {
    return obj !== null && typeof obj === "object" && "$" in obj && obj.$ === "nested-object"
}

/**
 * Converts a flat object with dot-separated keys into a nested object structure.
 *
 * The function takes an object where keys may contain dots to indicate nesting
 * (e.g., "user.name", "user.settings.theme") and converts it into a structure with
 * NestedObject for intermediate nesting levels.
 *
 * @param flat - Flat object with dot-separated keys
 * @returns Nested object with NestedObject for intermediate levels
 *
 * @example
 * ```typescript
 * const flat = {
 *   "user.name": "Alice",
 *   "user.age": 30,
 *   "config.theme": "dark",
 *   "config.lang": "en"
 * };
 *
 * const nested = unflattenParsedObject(flat);
 * // Result:
 * // {
 * //   user: {
 * //     $: "nested-object",
 * //     name: "user",
 * //     value: {
 * //       name: "Alice",
 * //       age: 30
 * //     }
 * //   },
 * //   config: {
 * //     $: "nested-object",
 * //     name: "config",
 * //     value: {
 * //       theme: "dark",
 * //       lang: "en"
 * //     }
 * //   }
 * // }
 * ```
 *
 * @example
 * ```typescript
 * const flat = {
 *   "a.b.c": 42,
 *   "a.b.d": "test",
 *   "a.e": true
 * };
 *
 * const nested = unflattenParsedObject(flat);
 * // Result:
 * // {
 * //   a: {
 * //     $: "nested-object",
 * //     name: "a",
 * //     value: {
 * //       b: {
 * //         $: "nested-object",
 * //         name: "b",
 * //         value: {
 * //           c: 42,
 * //           d: "test"
 * //         }
 * //       },
 * //       e: true
 * //     }
 * //   }
 * // }
 * ```
 */
export function unflattenParsedObject(flat: FlattenParsedObject): ParsedObject {
    const result: ParsedObject = {}

    for (const [key, value] of Object.entries(flat)) {
        const parts = key.split(".")
        let current = result

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i]
            const existing = current[part]

            if (!isNestedObject(existing)) {
                current[part] = {
                    $: "nested-object",
                    name: part,
                    value: {},
                }
            }
            current = (current[part] as NestedObject).value ?? {}
        }

        const lastPart = parts.at(-1)
        if (lastPart) {
            current[lastPart] = value
        }
    }

    return result
}

/**
 * Converts a nested object structure back into a flat object with dot-separated keys.
 *
 * The function takes an object with NestedObject structures and flattens it by
 * combining nested paths with dots (e.g., {user: {name: "Alice"}} becomes {"user.name": "Alice"}).
 *
 * @param nested - Nested object with NestedObject structures
 * @returns Flat object with dot-separated keys
 *
 * @example
 * ```typescript
 * const nested = {
 *   user: {
 *     $: "nested-object",
 *     name: "user",
 *     value: {
 *       name: "Alice",
 *       age: 30
 *     }
 *   },
 *   config: {
 *     $: "nested-object",
 *     name: "config",
 *     value: {
 *       theme: "dark"
 *     }
 *   }
 * };
 *
 * const flat = flattenParsedObject(nested);
 * // Result: {"user.name": "Alice", "user.age": 30, "config.theme": "dark"}
 * ```
 *
 * @example
 * ```typescript
 * const nested = {
 *   a: {
 *     $: "nested-object",
 *     name: "a",
 *     value: {
 *       b: {
 *         $: "nested-object",
 *         name: "b",
 *         value: {
 *           c: 42
 *         }
 *       }
 *     }
 *   }
 * };
 *
 * const flat = flattenParsedObject(nested);
 * // Result: {"a.b.c": 42}
 * ```
 */
export function flattenParsedObject(nested: ParsedObject): FlattenParsedObject {
    const result: FlattenParsedObject = {}

    function flatten(obj: ParsedObject, prefix: string = ""): void {
        for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key

            if (isNestedObject(value)) {
                flatten(value.value ?? {}, fullKey)
            } else {
                result[fullKey] = value
            }
        }
    }

    flatten(nested)
    return result
}
