import {parseTuple} from "./tuple-decode"
import {encodeTuple} from "./tuple-encode"
import {ContractAbi, Field, TypeAbi, TypeInfo} from "@shared/abi"
import {Address, beginCell, Cell, ExternalAddress, Slice, TupleReader} from "@ton/core"
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

function normalizeTupleForComparison(obj: unknown): unknown {
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
        return obj.map(element => normalizeTupleForComparison(element))
    }

    if (typeof obj === "object") {
        const normalized: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(obj)) {
            normalized[key] = normalizeTupleForComparison(value)
        }
        return normalized
    }

    return obj
}

function expectTupleNormalizedEqual(actual: unknown, expected: unknown): void {
    expect(normalizeTupleForComparison(actual)).toEqual(normalizeTupleForComparison(expected))
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

function createMockTypeAbi(fields: readonly Field[]): TypeAbi {
    return {
        name: "TestType",
        opcode: undefined,
        opcodeWidth: undefined,
        fields,
    }
}

function testTupleRoundtrip(fields: readonly Field[], testData: ParsedObject): () => void {
    return () => {
        const typeAbi = createMockTypeAbi(fields)
        const encodedTuple = encodeTuple(mockAbi, typeAbi, testData)
        const reader = new TupleReader(encodedTuple)
        const parsedData = parseTuple(mockAbi, typeAbi, reader)
        expectTupleNormalizedEqual(parsedData, testData)
    }
}

describe("Tuple Round-trip encoding/decoding", () => {
    describe("Basic integer types", () => {
        it(
            "should round-trip uint5",
            testTupleRoundtrip([field("value", uint(5))], {
                value: 15n,
            }),
        )

        it(
            "should round-trip int32",
            testTupleRoundtrip([field("value", int(32))], {
                value: 123n,
            }),
        )

        it(
            "should round-trip negative int32",
            testTupleRoundtrip([field("value", int(32))], {
                value: -123n,
            }),
        )

        it(
            "should round-trip uint64",
            testTupleRoundtrip([field("value", uint(64))], {
                value: 18_446_744_073_709_551_615n, // max uint64
            }),
        )

        it(
            "should round-trip zero values",
            testTupleRoundtrip([field("zero_int", int(32)), field("zero_uint", uint(32))], {
                zero_int: 0n,
                zero_uint: 0n,
            }),
        )
    })

    describe("Special types", () => {
        it(
            "should round-trip coins",
            testTupleRoundtrip([field("amount", coins())], {
                amount: 1_000_000_000n,
            }),
        )

        it(
            "should round-trip bool true",
            testTupleRoundtrip([field("active", bool())], {
                active: true,
            }),
        )

        it(
            "should round-trip bool false",
            testTupleRoundtrip([field("active", bool())], {
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
            const encodedTuple = encodeTuple(mockAbi, typeAbi, testData)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

            expect(parsedData.addr).toBeInstanceOf(Address)
            expect((parsedData.addr as Address).equals(addr)).toBe(true)
            expectTupleNormalizedEqual(parsedData, testData)
        })

        it("should round-trip AddressNone", () => {
            const fields: Field[] = [field("addr", address())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {addr: new AddressNone()}
            const encodedTuple = encodeTuple(mockAbi, typeAbi, testData)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

            expect(parsedData.addr).toEqual(new AddressNone())
        })
    })

    describe("Optional types", () => {
        it(
            "should round-trip optional int32 with value",
            testTupleRoundtrip([field("value", optional(int(32)))], {
                value: 255n,
            }),
        )

        it(
            "should round-trip optional int32 without value",
            testTupleRoundtrip([field("value", optional(int(32)))], {
                value: null,
            }),
        )

        it(
            "should round-trip optional bool with value",
            testTupleRoundtrip([{name: "flag", type: optional(bool())}], {
                flag: true,
            }),
        )

        it(
            "should round-trip optional bool without value",
            testTupleRoundtrip([{name: "flag", type: optional(bool())}], {
                flag: null,
            }),
        )
    })

    describe("Variable integer types", () => {
        it(
            "should round-trip varint16",
            testTupleRoundtrip([field("var_int", varint16())], {
                var_int: 1000n,
            }),
        )

        it(
            "should round-trip varint32",
            testTupleRoundtrip([field("var_int32", varint32())], {
                var_int32: -123456789n,
            }),
        )

        it(
            "should round-trip varuint16",
            testTupleRoundtrip([field("var_uint16", varuint16())], {
                var_uint16: 65535n,
            }),
        )

        it(
            "should round-trip varuint32",
            testTupleRoundtrip([field("var_uint", varuint32())], {
                var_uint: 50_000n,
            }),
        )
    })

    describe("Cell and Slice types", () => {
        it("should round-trip cell reference", () => {
            const refCell = beginCell().storeInt(123, 32).endCell()
            const fields: Field[] = [{name: "ref", type: cell()}]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {ref: refCell}
            const encodedTuple = encodeTuple(mockAbi, typeAbi, testData)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

            expect(parsedData.ref).toBeInstanceOf(Cell)
            expect((parsedData.ref as Cell).hash()).toEqual(refCell.hash())
        })

        it("should round-trip slice", () => {
            const sliceData = makeSlice("x{DEADBEEF}")
            const fields: Field[] = [field("slice_field", slice())]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {slice_field: sliceData}
            const encodedTuple = encodeTuple(mockAbi, typeAbi, testData)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

            expect(parsedData.slice_field).toBeInstanceOf(Slice)
            expectTupleNormalizedEqual(parsedData, testData)
        })
    })

    describe("Struct types", () => {
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

            const encodedTuple = encodeTuple(mockAbi, typeAbi, testData)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

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

            const encodedTuple = encodeTuple(mockAbi, typeAbi, testData)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

            expect(parsedData).toEqual(testData)
        })
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

            const encodedTuple = encodeTuple(mockAbi, typeAbi, testData)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

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

            const encodedTuple = encodeTuple(mockAbi, typeAbi, testDataWithValue)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

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

            const encodedTuple = encodeTuple(mockAbi, typeAbi, testDataWithNull)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

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

            const encodedTuple = encodeTuple(mockAbi, typeAbi, testData)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

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

            const encodedTuple = encodeTuple(mockAbi, typeAbi, testData)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

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

            const encodedTuple = encodeTuple(mockAbi, typeAbi, testDataWithValue)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

            expect(parsedData).toEqual(testDataWithValue)
        })

        it("should round-trip optional Cell<Point> with null", () => {
            const fields: Field[] = [field("maybe_typed_cell", optional(cell(struct("Point"))))]
            const typeAbi = createMockTypeAbi(fields)

            const testDataWithNull = {
                maybe_typed_cell: null,
            }

            const encodedTuple = encodeTuple(mockAbi, typeAbi, testDataWithNull)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

            expect(parsedData).toEqual(testDataWithNull)
        })

        it("should round-trip Cell<bool>", () => {
            const fields: Field[] = [field("typed_cell", cell(bool()))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                typed_cell: {
                    $: "nested-object" as const,
                    name: "Cell<bool>",
                    value: {
                        value: true,
                    },
                },
            }

            const encodedTuple = encodeTuple(mockAbi, typeAbi, testData)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

            expect(parsedData).toEqual(testData)
        })

        it("should round-trip Cell<coins>", () => {
            const fields: Field[] = [field("typed_cell", cell(coins()))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                typed_cell: {
                    $: "nested-object" as const,
                    name: "Cell<coins>",
                    value: {
                        value: 5_000_000_000n,
                    },
                },
            }

            const encodedTuple = encodeTuple(mockAbi, typeAbi, testData)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

            expect(parsedData).toEqual(testData)
        })

        it("should round-trip Cell<address>", () => {
            const addr = Address.parse(
                "0:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            )
            const fields: Field[] = [field("typed_cell", cell(address()))]
            const typeAbi = createMockTypeAbi(fields)

            const testData = {
                typed_cell: {
                    $: "nested-object" as const,
                    name: "Cell<address>",
                    value: {
                        value: addr,
                    },
                },
            }

            const encodedTuple = encodeTuple(mockAbi, typeAbi, testData)
            const reader = new TupleReader(encodedTuple)
            const parsedData = parseTuple(mockAbi, typeAbi, reader)

            expectTupleNormalizedEqual(parsedData, testData)
        })
    })

    describe("Mixed types", () => {
        it(
            "should round-trip multiple fields",
            testTupleRoundtrip(
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
            testTupleRoundtrip(
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
            "should round-trip complex nested data with typed cells",
            testTupleRoundtrip(
                [
                    field("id", uint(64)),
                    field("optional_struct", optional(struct("Point"))),
                    field("typed_cell", cell(optional(coins()))),
                    field("var_amount", varuint32()),
                ],
                {
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
                    var_amount: 888888n,
                },
            ),
        )
    })
})
