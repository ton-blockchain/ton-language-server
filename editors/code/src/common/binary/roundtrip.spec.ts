import {Address, beginCell, Cell, ExternalAddress, Slice} from "@ton/core"

import {ContractAbi, Field, TypeAbi, TypeInfo} from "@shared/abi"

import {parseData} from "./decode"
import {encodeData} from "./encode"

import {AddressNone, ParsedObject} from "./types"

import {makeSlice} from "./index"

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

function cell(innerType?: TypeInfo): TypeInfo {
    const humanReadable = innerType ? `Cell<${innerType.humanReadable}>` : "cell"
    if (innerType) {
        if (innerType.name === "struct") {
            return {name: "cell", innerType, humanReadable}
        }
        return {
            name: "cell",
            innerType: {
                name: "anon-struct",
                fields: [innerType],
                humanReadable: innerType.humanReadable,
            },
            humanReadable,
        }
    }
    return {name: "cell", innerType: undefined, humanReadable}
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

function normalizeForComparison(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
        return obj
    }

    if (typeof obj === "bigint") {
        return obj.toString()
    }

    if (obj instanceof Address || obj instanceof ExternalAddress) {
        return obj.toString()
    }

    if (obj instanceof Slice) {
        return obj.toString()
    }

    if (obj instanceof Cell) {
        return obj.hash().toString("hex")
    }

    if (Array.isArray(obj)) {
        return obj.map(element => normalizeForComparison(element))
    }

    if (typeof obj === "object") {
        const normalized: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(obj)) {
            normalized[key] = normalizeForComparison(value)
        }
        return normalized
    }

    return obj
}

function expectNormalizedEqual(actual: unknown, expected: unknown): void {
    expect(normalizeForComparison(actual)).toEqual(normalizeForComparison(expected))
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
        {
            name: "Message",
            opcode: 0x12345678,
            opcodeWidth: 32,
            fields: [
                field("op", uint(32)),
                field("query_id", uint(64)),
                field("sender", address()),
                field("amount", coins()),
            ],
        },
        {
            name: "Transfer",
            opcode: 0xab,
            opcodeWidth: 8,
            fields: [field("to", address()), field("value", coins()), field("bounce", bool())],
        },
        {
            name: "ComplexMessage",
            opcode: 0x1234,
            opcodeWidth: 16,
            fields: [
                field("header", struct("Message")),
                field("payload", optional(cell(struct("Point")))),
                field("metadata", bits(128)),
            ],
        },
    ],
    messages: [],
    getMethods: [],
    entryPoint: undefined,
    externalEntryPoint: undefined,
}

function typeAlias(aliasName: string, innerType: TypeInfo): TypeInfo {
    return {
        name: "type-alias",
        aliasName,
        innerType,
        humanReadable: aliasName,
    }
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
        expectNormalizedEqual(parsedData, testData)
    }
}

describe("Round-trip encoding/decoding", () => {
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

        it(
            "should round-trip int8 min/max values",
            testRoundtrip([field("min_val", int(8)), field("max_val", int(8))], {
                min_val: -128n,
                max_val: 127n,
            }),
        )

        it(
            "should round-trip uint8 max value",
            testRoundtrip([field("value", uint(8))], {
                value: 255n,
            }),
        )

        it(
            "should round-trip int16 values",
            testRoundtrip([field("negative", int(16)), field("positive", int(16))], {
                negative: -32768n,
                positive: 32767n,
            }),
        )

        it(
            "should round-trip uint16 max value",
            testRoundtrip([field("value", uint(16))], {
                value: 65535n,
            }),
        )

        it(
            "should round-trip int64 min/max values",
            testRoundtrip([field("min_val", int(64)), field("max_val", int(64))], {
                min_val: -9_223_372_036_854_775_808n,
                max_val: 9_223_372_036_854_775_807n,
            }),
        )

        it(
            "should round-trip uint1 (single bit)",
            testRoundtrip([field("bit", uint(1))], {
                bit: 1n,
            }),
        )

        it(
            "should round-trip uint256 large value",
            testRoundtrip([field("large", uint(256))], {
                large: BigInt("0x123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0"),
            }),
        )

        it(
            "should round-trip zero values",
            testRoundtrip([field("zero_int", int(32)), field("zero_uint", uint(32))], {
                zero_int: 0n,
                zero_uint: 0n,
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
            expectNormalizedEqual(parsedData, testData)
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
            expectNormalizedEqual(parsedData, testData)
        })

        it("should round-trip AddressNone", () => {
            const fields: Field[] = [field("addr", address())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {addr: new AddressNone()}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.addr).toEqual(new AddressNone())
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

    describe("Typed Cell references", () => {
        it("should round-trip Cell<int32>", () => {
            const fields: Field[] = [field("typed_cell", cell(int(32)))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                typed_cell: {
                    $: "nested-object" as const,
                    name: "Cell<int32>",
                    value: {
                        value: 42n,
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testData)
        })

        it("should round-trip Cell<uint256?>", () => {
            const fields: Field[] = [field("typed_cell", cell(optional(uint(256))))]
            const typeAbi = createMockTypeAbi(fields)

            const testDataWithValue = {
                typed_cell: {
                    $: "nested-object" as const,
                    name: "Cell<uint256?>",
                    value: {
                        value: 123_456_789n,
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testDataWithValue)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testDataWithValue)
        })

        it("should round-trip Cell<uint256?> with null", () => {
            const fields: Field[] = [field("typed_cell", cell(optional(uint(256))))]
            const typeAbi = createMockTypeAbi(fields)

            const testDataWithNull = {
                typed_cell: {
                    $: "nested-object" as const,
                    name: "Cell<uint256?>",
                    value: {
                        value: null,
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testDataWithNull)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testDataWithNull)
        })

        it("should round-trip Cell<Point>", () => {
            const fields: Field[] = [field("typed_cell", cell(struct("Point")))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                typed_cell: {
                    $: "nested-object" as const,
                    name: "Cell<Point>",
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

        it("should round-trip Cell<Person> (nested struct)", () => {
            const fields: Field[] = [field("typed_cell", cell(struct("Person")))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                typed_cell: {
                    $: "nested-object" as const,
                    name: "Cell<Person>",
                    value: {
                        age: 30n,
                        active: false,
                        location: {
                            $: "nested-object" as const,
                            name: "Point",
                            value: {
                                x: 50n,
                                y: 100n,
                            },
                        },
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testData)
        })

        it("should round-trip optional Cell<Point>", () => {
            const fields: Field[] = [field("maybe_typed_cell", optional(cell(struct("Point"))))]
            const typeAbi = createMockTypeAbi(fields)

            const testDataWithValue = {
                maybe_typed_cell: {
                    $: "nested-object" as const,
                    name: "Cell<Point>",
                    value: {
                        x: 15n,
                        y: 25n,
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testDataWithValue)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testDataWithValue)
        })

        it("should round-trip optional Cell<Point> with null", () => {
            const fields: Field[] = [field("maybe_typed_cell", optional(cell(struct("Point"))))]
            const typeAbi = createMockTypeAbi(fields)

            const testDataWithNull = {
                maybe_typed_cell: null,
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testDataWithNull)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testDataWithNull)
        })
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

        it("should round-trip varint32", () => {
            const fields: Field[] = [field("var_int32", varint32())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {var_int32: -123456789n}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.var_int32).toBe(-123456789n)
        })

        it("should round-trip varuint16", () => {
            const fields: Field[] = [field("var_uint16", varuint16())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {var_uint16: 65535n}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.var_uint16).toBe(65535n)
        })

        it("should round-trip varuint32", () => {
            const fields: Field[] = [field("var_uint", varuint32())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {var_uint: 50_000n}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.var_uint).toBe(50_000n)
        })

        it("should round-trip optional varint types", () => {
            const fields: Field[] = [
                field("maybe_varint16", optional(varint16())),
                field("maybe_varuint32", optional(varuint32())),
            ]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                maybe_varint16: -999n,
                maybe_varuint32: null,
            }
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testData)
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

    describe("Slice types", () => {
        it("should round-trip slice with data and refs", () => {
            const refCell = beginCell().storeInt(999, 32).endCell()
            const sliceData = makeSlice("x{DEADBEEF12345678}", [refCell])
            const fields: Field[] = [field("slice_field", slice())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {slice_field: sliceData}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.slice_field).toBeInstanceOf(Slice)
            expectNormalizedEqual(parsedData, testData)
        })

        it("should round-trip slice with only data", () => {
            const sliceData = makeSlice("x{CAFEBABE}")
            const fields: Field[] = [field("data_slice", slice())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {data_slice: sliceData}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.data_slice).toBeInstanceOf(Slice)
            expectNormalizedEqual(parsedData, testData)
        })

        it("should round-trip empty slice", () => {
            const emptySlice = makeSlice("x{}")
            const fields: Field[] = [field("empty_slice", slice())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {empty_slice: emptySlice}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.empty_slice).toBeInstanceOf(Slice)
            expectNormalizedEqual(parsedData, testData)
        })

        it("should round-trip optional slice with value", () => {
            const sliceData = makeSlice("x{ABCDEF123456}")
            const fields: Field[] = [field("maybe_slice", optional(slice()))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {maybe_slice: sliceData}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.maybe_slice).toBeInstanceOf(Slice)
            expectNormalizedEqual(parsedData, testData)
        })

        it("should round-trip optional slice with null", () => {
            const fields: Field[] = [field("maybe_slice", optional(slice()))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {maybe_slice: null}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData.maybe_slice).toBe(null)
            expectNormalizedEqual(parsedData, testData)
        })

        it("should round-trip Cell containing slice", () => {
            const sliceData = makeSlice("x{FEDCBA9876543210}")
            const fields: Field[] = [field("slice_cell", cell(slice()))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                slice_cell: {
                    $: "nested-object" as const,
                    name: "Cell<slice>",
                    value: {
                        value: sliceData,
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expectNormalizedEqual(parsedData, testData)
        })
    })

    describe("Type aliases", () => {
        it("should round-trip type alias for int32", () => {
            const fields: Field[] = [field("user_id", typeAlias("UserId", int(32)))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {user_id: 12345n}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testData)
        })

        it("should round-trip type alias for address", () => {
            const fields: Field[] = [field("wallet", typeAlias("WalletAddress", address()))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                wallet: Address.parse(
                    "0:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                ),
            }
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expectNormalizedEqual(parsedData, testData)
        })

        it("should round-trip optional type alias", () => {
            const fields: Field[] = [field("maybe_amount", optional(typeAlias("Amount", coins())))]
            const typeAbi = createMockTypeAbi(fields)

            const testDataWithValue = {maybe_amount: 1000000000n}
            const encodedCell = encodeData(mockAbi, typeAbi, testDataWithValue)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testDataWithValue)
        })

        it("should round-trip nested type aliases", () => {
            const fields: Field[] = [
                field("balance", typeAlias("Balance", typeAlias("Amount", coins()))),
            ]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {balance: 500000000n}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testData)
        })
    })

    describe("Extended bits types", () => {
        it("should round-trip various bit widths", () => {
            const fields: Field[] = [
                field("bits1", bits(1)),
                field("bits7", bits(7)),
                field("bits32", bits(32)),
                field("bits256", bits(256)),
            ]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                bits1: makeSlice("b{1}"),
                bits7: makeSlice("b{1010101}"),
                bits32: makeSlice("x{DEADBEEF}"),
                bits256: makeSlice(
                    "x{123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0}",
                ),
            }
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expectNormalizedEqual(parsedData, testData)
        })

        it("should round-trip empty bits", () => {
            const fields: Field[] = [field("empty_bits", bits(0))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {empty_bits: makeSlice("x{}")}
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expectNormalizedEqual(parsedData, testData)
        })
    })

    describe("Complex nested structures", () => {
        it("should round-trip mixed complex types", () => {
            const fields: Field[] = [
                field("id", uint(64)),
                field("optional_struct", optional(struct("Point"))),
                field("typed_cell", cell(optional(coins()))),
                field("alias_field", typeAlias("CustomBits", bits(64))),
                field("var_amount", varuint32()),
                field("final_slice", slice()),
            ]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                id: 999999999n,
                optional_struct: {
                    $: "nested-object" as const,
                    name: "Point",
                    value: {
                        x: -999n,
                        y: 999n,
                    },
                },
                typed_cell: {
                    $: "nested-object" as const,
                    name: "Cell<coins?>",
                    value: {
                        value: 123456789n,
                    },
                },
                alias_field: makeSlice("x{ABCDEF1234567890}"),
                var_amount: 888888n,
                final_slice: makeSlice("x{CAFEBABE}"),
            }
            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expectNormalizedEqual(parsedData, testData)
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

        it(
            "should round-trip two addresses and coins",
            testRoundtrip(
                [
                    field("amount", coins()),
                    field("sender", address()),
                    field("recipient", address()),
                ],
                {
                    sender: Address.parse(
                        "0:1111111111111111111111111111111111111111111111111111111111111111",
                    ),
                    recipient: Address.parse(
                        "0:2222222222222222222222222222222222222222222222222222222222222222",
                    ),
                    amount: 2_500_000_000n,
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

    describe("Struct types with opcodes", () => {
        it("should round-trip struct with 32-bit opcode", () => {
            const fields: Field[] = [field("msg", struct("Message"))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                msg: {
                    $: "nested-object" as const,
                    name: "Message",
                    value: {
                        op: 0x11111111n,
                        query_id: 123456789n,
                        sender: Address.parse(
                            "0:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                        ),
                        amount: 1000000000n,
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expectNormalizedEqual(parsedData, testData)
        })

        it("should round-trip struct with 8-bit opcode", () => {
            const fields: Field[] = [field("transfer", struct("Transfer"))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                transfer: {
                    $: "nested-object" as const,
                    name: "Transfer",
                    value: {
                        to: Address.parse(
                            "0:fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
                        ),
                        value: 500000000n,
                        bounce: true,
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expectNormalizedEqual(parsedData, testData)
        })

        it("should round-trip complex struct with nested opcode struct", () => {
            const fields: Field[] = [field("complex", struct("ComplexMessage"))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                complex: {
                    $: "nested-object" as const,
                    name: "ComplexMessage",
                    value: {
                        header: {
                            $: "nested-object" as const,
                            name: "Message",
                            value: {
                                op: 0x99999999n,
                                query_id: 987654321n,
                                sender: Address.parse(
                                    "0:fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
                                ),
                                amount: 2000000000n,
                            },
                        },
                        payload: null, // Set to null since it's optional
                        metadata: makeSlice("x{DEADBEEFCAFEBABE1234567890ABCDEF}"),
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expectNormalizedEqual(parsedData, testData)
        })

        it("should round-trip complex struct with non-null payload", () => {
            const fields: Field[] = [field("complex", struct("ComplexMessage"))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                complex: {
                    $: "nested-object" as const,
                    name: "ComplexMessage",
                    value: {
                        header: {
                            $: "nested-object" as const,
                            name: "Message",
                            value: {
                                op: 0x88888888n,
                                query_id: 555666777n,
                                sender: Address.parse(
                                    "0:fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
                                ),
                                amount: 1500000000n,
                            },
                        },
                        payload: {
                            $: "nested-object" as const,
                            name: "Cell<Point>",
                            value: {
                                x: -100n,
                                y: -200n,
                            },
                        },
                        metadata: makeSlice("x{DEADBEEFCAFEBABE1234567890ABCDEF}"),
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expectNormalizedEqual(parsedData, testData)
        })

        it("should round-trip optional struct with opcode", () => {
            const fields: Field[] = [field("maybe_transfer", optional(struct("Transfer")))]
            const typeAbi = createMockTypeAbi(fields)

            const testDataWithValue = {
                maybe_transfer: {
                    $: "nested-object" as const,
                    name: "Transfer",
                    value: {
                        to: Address.parse(
                            "0:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                        ),
                        value: 750000000n,
                        bounce: false,
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testDataWithValue)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expectNormalizedEqual(parsedData, testDataWithValue)
        })

        it("should round-trip optional struct with opcode as null", () => {
            const fields: Field[] = [field("maybe_msg", optional(struct("Message")))]
            const typeAbi = createMockTypeAbi(fields)

            const testDataWithNull = {
                maybe_msg: null,
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testDataWithNull)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expect(parsedData).toEqual(testDataWithNull)
        })

        it("should round-trip Cell containing struct with opcode", () => {
            const fields: Field[] = [field("msg_cell", cell(struct("Transfer")))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                msg_cell: {
                    $: "nested-object" as const,
                    name: "Cell<Transfer>",
                    value: {
                        to: Address.parse(
                            "0:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                        ),
                        value: 300000000n,
                        bounce: true,
                    },
                },
            }

            const encodedCell = encodeData(mockAbi, typeAbi, testData)
            const parsedData = parseData(mockAbi, typeAbi, encodedCell.beginParse())

            expectNormalizedEqual(parsedData, testData)
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
