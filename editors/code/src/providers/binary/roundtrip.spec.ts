import {parseData, ParsedObject} from "./decode"
import {encodeData} from "./encode"
import {ContractAbi, Field, TypeAbi, TypeInfo} from "@shared/abi"
import {Address, beginCell, BitString, Cell, ExternalAddress, Slice, BitReader} from "@ton/core"
import {paddedBufferToBits} from "@ton/core/dist/boc/utils/paddedBits"

function int(width: number): TypeInfo {
    return {name: "int", width, humanReadable: `int${width}`}
}

function uint(width: number): TypeInfo {
    return {name: "uint", width, humanReadable: `uint${width}`}
}

function coins(): TypeInfo {
    return {name: "coins", humanReadable: "coins"}
}

function bool(): TypeInfo {
    return {name: "bool", humanReadable: "bool"}
}

function address(): TypeInfo {
    return {name: "address", humanReadable: "address"}
}

function bits(width: number): TypeInfo {
    return {name: "bits", width, humanReadable: `bits${width}`}
}

function cell(innerType?: string): TypeInfo {
    const humanReadable = innerType ? `Cell<${innerType}>` : "cell"
    return {name: "cell", innerType, humanReadable}
}

function slice(): TypeInfo {
    return {name: "slice", humanReadable: "slice"}
}

function varint16(): TypeInfo {
    return {name: "varint16", humanReadable: "varint16"}
}

function varint32(): TypeInfo {
    return {name: "varint32", humanReadable: "varint32"}
}

function varuint16(): TypeInfo {
    return {name: "varuint16", humanReadable: "varuint16"}
}

function varuint32(): TypeInfo {
    return {name: "varuint32", humanReadable: "varuint32"}
}

function optional(innerType: TypeInfo): TypeInfo {
    return {name: "option", innerType, humanReadable: `${innerType.humanReadable}?`}
}

function struct(structName: string): TypeInfo {
    return {name: "struct", structName, humanReadable: structName}
}

function field(name: string, type: TypeInfo): Field {
    return {name, type}
}

function convertBinSliceToHex(binSlice: string): string {
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

function makeSlice(hexOrBin: string, refs: Cell[] = []): Slice {
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

const mockAbi: ContractAbi = {
    name: "TestContract",
    storage: undefined,
    types: [
        {
            name: "Point",
            opcode: undefined,
            opcodeWidth: undefined,
            fields: [field("x", int(32)), field("y", int(32))],
        },
        {
            name: "Person",
            opcode: undefined,
            opcodeWidth: undefined,
            fields: [
                field("age", uint(8)),
                field("active", bool()),
                field("location", struct("Point")),
            ],
        },
    ],
    messages: [],
    getMethods: [],
    entryPoint: undefined,
    externalEntryPoint: undefined,
}

function createMockTypeAbi(
    fields: readonly Field[],
    opcode?: number,
    opcodeWidth?: number,
): TypeAbi {
    return {
        name: "TestType",
        opcode,
        opcodeWidth,
        fields,
    }
}

function testRoundtrip(
    fields: readonly Field[],
    testData: ParsedObject,
    opcode?: number,
    opcodeWidth?: number,
): () => void {
    return () => {
        const typeAbi = createMockTypeAbi(fields, opcode, opcodeWidth)
        const encodedCell = encodeData(mockAbi, typeAbi, testData)
        const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())
        expect(parsedData).toEqual(testData)
    }
}

describe("Roundtrip encoding/decoding", () => {
    describe("Basic integer types", () => {
        it(
            "should round-trip uint5",
            testRoundtrip([field("value", uint(5))], {
                value: 15n,
            }),
        )

        it(
            "should round-trip int32",
            testRoundtrip([field("value", int(32))], {
                value: 123n,
            }),
        )

        it(
            "should round-trip negative int32",
            testRoundtrip([field("value", int(32))], {
                value: -123n,
            }),
        )

        it(
            "should round-trip uint64",
            testRoundtrip([field("value", uint(64))], {
                value: 18_446_744_073_709_551_615n, // max uint64
            }),
        )
    })

    describe("Special types", () => {
        it(
            "should round-trip coins",
            testRoundtrip([field("amount", coins())], {
                amount: 1_000_000_000n,
            }),
        )

        it(
            "should round-trip bool true",
            testRoundtrip([field("active", bool())], {
                active: true,
            }),
        )

        it(
            "should round-trip bool false",
            testRoundtrip([field("active", bool())], {
                active: false,
            }),
        )

        it("should round-trip address", () => {
            const addr = Address.parse(
                "0:ca6e321c7cce9ecedf0a8ca2492ec8592494aa5fb5ce0387dff96ef6af982a3e",
            )
            const fields: Field[] = [field("addr", address())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {addr}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.addr).toBeInstanceOf(Address)
            expect((parsedData.addr as Address).equals(addr)).toBe(true)
        })

        it("should round-trip external address", () => {
            const extAddr = new ExternalAddress(70n, 10)
            const fields: Field[] = [field("addr", address())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {addr: extAddr}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.addr).toBeInstanceOf(ExternalAddress)
            expect((parsedData.addr as ExternalAddress).value).toBe(70n)
            expect((parsedData.addr as ExternalAddress).bits).toBe(10)
        })

        it("should round-trip null address", () => {
            const fields: Field[] = [field("addr", address())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {addr: null}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.addr).toBe(null)
        })
    })

    describe("Optional types", () => {
        it(
            "should round-trip optional int32 with value",
            testRoundtrip([field("value", optional(int(32)))], {
                value: 255n,
            }),
        )

        it(
            "should round-trip optional int32 without value",
            testRoundtrip([field("value", optional(int(32)))], {
                value: null,
            }),
        )

        it(
            "should round-trip optional bool with value",
            testRoundtrip([{name: "flag", type: optional(bool())}], {
                flag: true,
            }),
        )

        it(
            "should round-trip optional bool without value",
            testRoundtrip([{name: "flag", type: optional(bool())}], {
                flag: null,
            }),
        )
    })

    describe("Cell references", () => {
        it("should round-trip cell reference", () => {
            const refCell = beginCell().storeInt(123, 32).endCell()
            const fields: Field[] = [{name: "ref", type: cell()}]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {ref: refCell}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.ref).toBeInstanceOf(Cell)
            expect((parsedData.ref as Cell).hash()).toEqual(refCell.hash())
        })

        it(
            "should round-trip optional cell with value",
            testRoundtrip([field("maybe_ref", optional(cell()))], {
                maybe_ref: beginCell().storeInt(789, 32).endCell(),
            }),
        )

        it(
            "should round-trip optional cell without value",
            testRoundtrip([field("maybe_ref", optional(cell()))], {
                maybe_ref: null,
            }),
        )
    })

    describe("Variable integer types", () => {
        it("should round-trip varint16", () => {
            const fields: Field[] = [field("var_int", varint16())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {var_int: 1000n}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.var_int).toBe(1000n)
        })

        it("should round-trip varuint32", () => {
            const fields: Field[] = [field("var_uint", varuint32())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {var_uint: 50_000n}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.var_uint).toBe(50_000n)
        })
    })

    describe("Bits types", () => {
        it("should round-trip bits3", () => {
            const bitsSlice = makeSlice("b{111}")
            const fields: Field[] = [field("bits_field", bits(3))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {bits_field: bitsSlice.clone()}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.bits_field).toBeInstanceOf(Slice)
            expect((parsedData.bits_field as Slice).toString()).toBe(bitsSlice.toString())
        })

        it("should round-trip bytes1", () => {
            const bytesSlice = makeSlice("x{A4}") // 8 bits
            const fields: Field[] = [field("bytes_field", bits(8))] // bytes1 = bits8
            const typeAbi = createMockTypeAbi(fields)

            const testData = {bytes_field: bytesSlice.clone()}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.bytes_field).toBeInstanceOf(Slice)
            expect((parsedData.bytes_field as Slice).toString()).toBe(bytesSlice.toString())
        })
    })

    describe("Combined types", () => {
        it(
            "should round-trip multiple fields",
            testRoundtrip(
                [
                    field("op", int(32)),
                    field("query_id", uint(64)),
                    field("amount", coins()),
                    field("active", bool()),
                ],
                {
                    op: 123n,
                    query_id: 456_789n,
                    amount: 1_000_000_000n,
                    active: true,
                },
            ),
        )

        it(
            "should round-trip mixed optional and regular fields",
            testRoundtrip(
                [
                    field("op", int(32)),
                    field("maybe_query", optional(uint(64))),
                    field("maybe_addr", optional(address())),
                    field("final_flag", bool()),
                ],
                {
                    op: 123n,
                    maybe_query: 456n,
                    maybe_addr: null,
                    final_flag: false,
                },
            ),
        )
    })

    describe("Custom struct types", () => {
        it("should round-trip simple struct", () => {
            const fields: Field[] = [field("point", struct("Point"))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                point: {
                    $: "nested-object" as const,
                    name: "Point",
                    value: {
                        x: 10n,
                        y: 20n,
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testData)
        })

        it("should round-trip nested struct", () => {
            const fields: Field[] = [field("person", struct("Person"))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                person: {
                    $: "nested-object" as const,
                    name: "Person",
                    value: {
                        age: 25n,
                        active: true,
                        location: {
                            $: "nested-object" as const,
                            name: "Point",
                            value: {
                                x: 100n,
                                y: 200n,
                            },
                        },
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testData)
        })

        it("should round-trip optional struct", () => {
            const fields: Field[] = [field("maybe_point", optional(struct("Point")))]
            const typeAbi = createMockTypeAbi(fields)

            const testDataWithValue = {
                maybe_point: {
                    $: "nested-object" as const,
                    name: "Point",
                    value: {
                        x: 5n,
                        y: 15n,
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testDataWithValue)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testDataWithValue)
        })

        it("should round-trip optional struct with null", () => {
            const fields: Field[] = [field("maybe_point", optional(struct("Point")))]
            const typeAbi = createMockTypeAbi(fields)

            const testDataWithNull = {
                maybe_point: null,
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testDataWithNull)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testDataWithNull)
        })
    })

    describe("Opcode prefixes", () => {
        it(
            "should round-trip with opcode prefix",
            testRoundtrip(
                [field("op", int(32)), field("amount", coins())],
                {
                    op: 123n,
                    amount: 1_000_000_000n,
                },
                0x12_34_56_78,
                32,
            ),
        )

        it(
            "should round-trip with short opcode prefix",
            testRoundtrip(
                [{name: "value", type: uint(32)}],
                {
                    value: 42n,
                },
                0xab,
                8,
            ),
        )
    })
})
