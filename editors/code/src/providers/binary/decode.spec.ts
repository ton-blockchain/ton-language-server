import {parseData} from "./decode"
import {ContractAbi, Field, TypeAbi} from "@shared/abi"
import {Address, beginCell, BitString, Cell, ExternalAddress, Slice, BitReader} from "@ton/core"
import {paddedBufferToBits} from "@ton/core/dist/boc/utils/paddedBits"

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

// Mock ABI for tests
const mockAbi: ContractAbi = {
    name: "TestContract",
    storage: undefined,
    types: [],
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

describe("parseData", () => {
    it("utils", () => {
        expect(convertBinSliceToHex("b{0}")).toBe("x{4_}")
        expect(convertBinSliceToHex("b{00}")).toBe("x{2_}")
        expect(convertBinSliceToHex("b{000}")).toBe("x{1_}")
        expect(convertBinSliceToHex("b{0000}")).toBe("x{0}")
        expect(convertBinSliceToHex("b{00000}")).toBe("x{04_}")
        expect(convertBinSliceToHex("b{0000001111}")).toBe("x{03E_}")
    })

    function testCase(
        fields: readonly Field[],
        data: string,
        expected: object,
        opcode?: number,
        opcodeWidth?: number,
    ): () => void {
        return () => {
            const slice = makeSlice(data)
            const typeAbi = createMockTypeAbi(fields, opcode, opcodeWidth)
            const result = parseData(mockAbi, typeAbi, slice)
            expect(result).toEqual(expected)
        }
    }

    describe("Basic integer types", () => {
        it(
            "JustUint5",
            testCase([{name: "value", type: "uint5"}], "x{04_}", {
                value: 0n,
            }),
        )
        it(
            "JustUint5",
            testCase([{name: "value", type: "uint5"}], "x{7C_}", {
                value: 15n,
            }),
        )
        it(
            "JustUint5",
            testCase([{name: "value", type: "uint5"}], "x{84_}", {
                value: 16n,
            }),
        )
        it(
            "JustUint5",
            testCase([{name: "value", type: "uint5"}], "x{FC_}", {
                value: 31n,
            }),
        )
        it(
            "JustInt32",
            testCase([{name: "value", type: "int32"}], "x{000000FF}", {
                value: 255n,
            }),
        )
        it(
            "JustInt32",
            testCase([{name: "value", type: "int32"}], "x{0000007B}", {
                value: 123n,
            }),
        )
        it(
            "JustInt32",
            testCase([{name: "value", type: "int32"}], "x{000001C8}", {
                value: 456n,
            }),
        )
    })

    describe("Optional types", () => {
        it(
            "JustMaybeInt32 with value",
            testCase([{name: "value", type: "int32?"}], "x{8000007FC_}", {
                value: 255n,
            }),
        )

        it(
            "JustMaybeInt32 without value",
            testCase([{name: "value", type: "int32?"}], "x{4_}", {
                value: null,
            }),
        )
    })

    describe("Combined types", () => {
        it(
            "TwoInts32AndCoins",
            testCase(
                [
                    {name: "op", type: "int32"},
                    {name: "amount", type: "coins"},
                ],
                "x{0000007B0}",
                {
                    op: 123n,
                    amount: 0n,
                },
            ),
        )

        it(
            "TwoInts32AndCoins",
            testCase(
                [
                    {name: "op", type: "int32"},
                    {name: "amount", type: "coins"},
                ],
                "x{0000007B43B9ACA00}",
                {
                    op: 123n,
                    amount: 1_000_000_000n,
                },
            ),
        )

        it(
            "TwoInts32And64",
            testCase(
                [
                    {name: "op", type: "int32"},
                    {name: "query_id", type: "uint64"},
                ],
                "x{0000007B00000000000000FF}",
                {
                    op: 123n,
                    query_id: 255n,
                },
            ),
        )
    })

    describe("Special types", () => {
        it("should parse coins", () => {
            const fields: Field[] = [{name: "amount", type: "coins"}]
            const slice = makeSlice("x{43B9ACA00}") // 1000000000 coins
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.amount).toBe(1_000_000_000n)
        })

        it("should parse bool true", () => {
            const fields: Field[] = [{name: "active", type: "bool"}]
            const slice = makeSlice("x{C_}") // true (1 bit)
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.active).toBe(true)
        })

        it("should parse bool false", () => {
            const fields: Field[] = [{name: "active", type: "bool"}]
            const slice = makeSlice("x{4_}") // false (0 bit)
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.active).toBe(false)
        })

        it("should parse internal address", () => {
            const fields: Field[] = [{name: "addr", type: "address"}]
            const addr = Address.parse(
                "0:ca6e321c7cce9ecedf0a8ca2492ec8592494aa5fb5ce0387dff96ef6af982a3e",
            )
            const slice = beginCell().storeAddress(addr).endCell().beginParse()
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.addr).toBeInstanceOf(Address)
            expect((result.addr as Address).equals(addr)).toBe(true)
        })

        it("should parse external address", () => {
            const fields: Field[] = [{name: "addr", type: "address"}]
            const slice = makeSlice("x{414234_}") // ExternalAddress(70, 10)
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.addr).toBeInstanceOf(ExternalAddress)
            expect((result.addr as ExternalAddress).bits).toBe(10)
            expect((result.addr as ExternalAddress).value).toBe(70n)
        })

        it("should parse none address", () => {
            const fields: Field[] = [{name: "addr", type: "address"}]
            const slice = makeSlice("x{2_}") // NoneAddress
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.addr).toBeNull()
        })
    })

    describe("Address types", () => {
        it.skip(
            "JustAddress internal",
            testCase(
                [{name: "addr", type: "address"}],
                "x{80194DC6438F99D3D9DBE151944925D90B2492954BF6B9C070FBFF2DDED5F30547D_}",
                {
                    addr: Address.parse(
                        "0:ca6e321c7cce9ecedf0a8ca2492ec8592494aa5fb5ce0387dff96ef6af982a3e",
                    ),
                },
            ),
        )

        it.skip(
            "JustAddress external",
            testCase([{name: "addr", type: "address"}], "x{414234_}", {
                addr: new ExternalAddress(70n, 10),
            }),
        )

        it(
            "JustAddress none",
            testCase([{name: "addr", type: "address"}], "x{2_}", {
                addr: null,
            }),
        )
    })

    describe("Complex structures 1", () => {
        it.skip(
            "TwoInts32And64SepByAddress external",
            testCase(
                [
                    {name: "op", type: "int32"},
                    {name: "addr_e", type: "address"},
                    {name: "query_id", type: "uint64"},
                ],
                "x{0000007B41423000000000000007FC_}",
                {
                    op: 123n,
                    addr_e: new ExternalAddress(70n, 10),
                    query_id: 255n,
                },
            ),
        )

        it(
            "TwoInts32And64SepByAddress none",
            testCase(
                [
                    {name: "op", type: "int32"},
                    {name: "addr_e", type: "address"},
                    {name: "query_id", type: "uint64"},
                ],
                "x{0000007B000000000000003F6_}",
                {
                    op: 123n,
                    addr_e: null,
                    query_id: 253n,
                },
            ),
        )

        it.skip(
            "IntAndEitherInt8Or256 int8",
            testCase(
                [
                    {name: "op", type: "int32"},
                    {name: "i8or256", type: "int8"},
                ],
                "x{0000007B284_}",
                {
                    op: 123n,
                    i8or256: 80n,
                },
            ),
        )

        it.skip(
            "IntAndEitherMaybe8Or256 EitherLeft",
            testCase(
                [
                    {name: "value", type: "int8"},
                    {name: "op", type: "int32"},
                ],
                "x{320000003DC_}",
                {
                    value: 100n,
                    op: 123n,
                },
            ),
        )

        it.skip(
            "IntAndEitherMaybe8Or256 EitherRight null",
            testCase(
                [
                    {name: "value", type: "int256?"},
                    {name: "op", type: "int32"},
                ],
                "x{8000001EE_}",
                {
                    value: null,
                    op: 123n,
                },
            ),
        )

        it(
            "TwoInts32AndMaybe64 with value",
            testCase(
                [
                    {name: "op", type: "int32"},
                    {name: "query_id", type: "uint64?"},
                    {name: "demo_bool_field", type: "bool"},
                ],
                "x{0000007B800000000000007FE_}",
                {
                    op: 123n,
                    query_id: 255n,
                    demo_bool_field: true,
                },
            ),
        )

        it(
            "TwoInts32AndMaybe64 without value true",
            testCase(
                [
                    {name: "op", type: "int32"},
                    {name: "query_id", type: "uint64?"},
                    {name: "demo_bool_field", type: "bool"},
                ],
                "x{0000007B6_}",
                {
                    op: 123n,
                    query_id: null,
                    demo_bool_field: true,
                },
            ),
        )

        it(
            "TwoInts32AndMaybe64 without value false",
            testCase(
                [
                    {name: "op", type: "int32"},
                    {name: "query_id", type: "uint64?"},
                    {name: "demo_bool_field", type: "bool"},
                ],
                "x{0000007B2_}",
                {
                    op: 123n,
                    query_id: null,
                    demo_bool_field: false,
                },
            ),
        )
    })

    describe("Cell references", () => {
        it("should parse cell reference", () => {
            const fields: Field[] = [{name: "ref", type: "cell"}]
            const refCell = beginCell().storeInt(123, 32).endCell()
            const slice = beginCell().storeRef(refCell).endCell().beginParse()
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.ref).toBeInstanceOf(Cell)
            expect((result.ref as Cell).hash()).toEqual(refCell.hash())
        })

        it("should parse typed cell reference", () => {
            const fields: Field[] = [{name: "typed_ref", type: "Cell<int32>"}]
            const refCell = beginCell().storeInt(456, 32).endCell()
            const slice = beginCell().storeRef(refCell).endCell().beginParse()
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.typed_ref).toHaveProperty("$", "nested-object")
            expect(result.typed_ref).toHaveProperty("name", "Cell<int32>")
            expect(result.typed_ref).toHaveProperty("value")
        })

        it("should parse optional cell reference with value", () => {
            const fields: Field[] = [{name: "maybe_ref", type: "cell?"}]
            const refCell = beginCell().storeInt(789, 32).endCell()
            const slice = beginCell().storeBit(1).storeRef(refCell).endCell().beginParse()
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.maybe_ref).toBeInstanceOf(Cell)
        })

        it("should parse optional cell reference without value", () => {
            const fields: Field[] = [{name: "maybe_ref", type: "cell?"}]
            const slice = beginCell().storeBit(0).endCell().beginParse()
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.maybe_ref).toBeNull()
        })
    })

    describe("Variable length integers", () => {
        it("should parse varint16", () => {
            const fields: Field[] = [{name: "var_int", type: "varint16"}]
            const slice = beginCell().storeVarInt(1000, 4).endCell().beginParse()
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.var_int).toBe(1000n)
        })

        it("should parse varuint32", () => {
            const fields: Field[] = [{name: "var_uint", type: "varuint32"}]
            const slice = beginCell().storeVarUint(50_000, 5).endCell().beginParse()
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.var_uint).toBe(50_000n)
        })
    })

    describe("Bits types", () => {
        it("should parse bits3", () => {
            const fields: Field[] = [{name: "bits_field", type: "bits3"}]
            const slice = makeSlice("x{7_}") // 111 in 3 bits
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.bits_field).toBeInstanceOf(Slice)
            expect((result.bits_field as Slice).remainingBits).toBe(3)
        })

        it("should parse bytes1", () => {
            const fields: Field[] = [{name: "bytes_field", type: "bytes1"}]
            const slice = makeSlice("x{A4}") // 8 bits
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.bytes_field).toBeInstanceOf(Slice)
            expect((result.bytes_field as Slice).remainingBits).toBe(8)
        })
    })

    describe("Complex structures", () => {
        it("should parse multiple fields in sequence", () => {
            const fields: Field[] = [
                {name: "op", type: "int32"},
                {name: "query_id", type: "uint64"},
                {name: "amount", type: "coins"},
                {name: "active", type: "bool"},
            ]
            //: TwoInts32And64 + coins + bool
            const slice = makeSlice("x{0000007B00000000000000FF43B9ACA00C_}")
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.op).toBe(123n)
            expect(result.query_id).toBe(BigInt(255))
            expect(result.amount).toBe(1_000_000_000n)
            expect(result.active).toBe(true)
        })

        it.skip("should parse mixed optional and regular fields", () => {
            const fields: Field[] = [
                {name: "op", type: "int32"},
                {name: "maybe_query", type: "uint64?"},
                {name: "maybe_addr", type: "address?"},
                {name: "final_flag", type: "bool"},
            ]
            // int32 + Some(uint64) + None + true
            const slice = makeSlice("x{0000007B800000000000007F26_}")
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.op).toBe(123n)
            expect(result.maybe_query).toBe(127n)
            expect(result.maybe_addr).toBeNull()
            expect(result.final_flag).toBe(true)
        })

        it("should handle remaining slice data", () => {
            const fields: Field[] = [
                {name: "op", type: "int32"},
                {name: "rest", type: "slice"},
            ]
            const slice = makeSlice("x{0000007BFFFF}")
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.op).toBe(123n)
            expect(result.rest).toBeInstanceOf(Slice)
            expect((result.rest as Slice).remainingBits).toBe(16)
        })
    })

    describe("Error handling", () => {
        it("should throw error for unknown type", () => {
            const fields: Field[] = [{name: "unknown", type: "unknown_type"}]
            const slice = makeSlice("x{FF}")
            const typeAbi = createMockTypeAbi(fields)

            expect(() => parseData(mockAbi, typeAbi, slice)).toThrow(
                "Unsupported type: unknown_type",
            )
        })

        it.skip("should throw error for integer without bit width", () => {
            const fields: Field[] = [{name: "bad_int", type: "int"}]
            const slice = makeSlice("x{FF}")
            const typeAbi = createMockTypeAbi(fields)

            expect(() => parseData(mockAbi, typeAbi, slice)).toThrow(
                "Integer type requires bit width",
            )
        })

        it("should provide field context in error messages", () => {
            const fields: Field[] = [{name: "test_field", type: "invalid_type"}]
            const slice = makeSlice("x{FF}")
            const typeAbi = createMockTypeAbi(fields)

            expect(() => parseData(mockAbi, typeAbi, slice)).toThrow(
                "Failed to parse field 'test_field' of type 'invalid_type'",
            )
        })

        it("should handle insufficient data gracefully", () => {
            const fields: Field[] = [{name: "big_int", type: "int32"}]
            const slice = makeSlice("x{FF}") // Only 8 bits, need 32
            const typeAbi = createMockTypeAbi(fields)

            expect(() => parseData(mockAbi, typeAbi, slice)).toThrow()
        })
    })

    describe("Message structures", () => {
        it(
            "MsgSinglePrefix32",
            testCase(
                [
                    {name: "amount1", type: "coins"},
                    {name: "amount2", type: "coins"},
                ],
                "x{8765432115042FAF0800}",
                {
                    amount1: 80n,
                    amount2: 800_000_000n,
                },
                0x87_65_43_21,
                32,
            ),
        )

        it(
            "CounterIncrement",
            testCase(
                [
                    {name: "counter_id", type: "int8"},
                    {name: "inc_by", type: "int32"},
                ],
                "x{123456787B0000004E}",
                {
                    counter_id: 123n,
                    inc_by: 78n,
                },
                0x12_34_56_78,
                32,
            ),
        )

        it(
            "CounterDecrement",
            testCase(
                [
                    {name: "counter_id", type: "int8"},
                    {name: "dec_by", type: "int32"},
                ],
                "x{2345678900FFFFFFDA}",
                {
                    counter_id: 0n,
                    dec_by: -38n,
                },
                0x23_45_67_89,
                32,
            ),
        )

        it(
            "CounterReset0",
            testCase(
                [{name: "counter_id", type: "int8"}],
                "x{3456789000}",
                {
                    counter_id: 0n,
                },
                0x34_56_78_90,
                32,
            ),
        )
    })

    describe("Real world examples", () => {
        it("should parse TwoInts32AndCoins structure", () => {
            const fields: Field[] = [
                {name: "op", type: "int32"},
                {name: "amount", type: "coins"},
            ]
            const slice = makeSlice("x{0000007B43B9ACA00}") // op: 123, amount: 1000000000
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.op).toBe(123n)
            expect(result.amount).toBe(1_000_000_000n)
        })

        it("should parse TwoInts32AndMaybe64 structure", () => {
            const fields: Field[] = [
                {name: "op", type: "int32"},
                {name: "query_id", type: "uint64?"},
                {name: "demo_bool_field", type: "bool"},
            ]
            const slice = makeSlice("x{0000007B800000000000007FE_}") // op: 123, query_id: Some(255), bool: true
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.op).toBe(123n)
            expect(result.query_id).toBe(BigInt(255))
            expect(result.demo_bool_field).toBe(true)
        })

        it("should parse structure with different address types", () => {
            const fields: Field[] = [
                {name: "op", type: "int32"},
                {name: "addr_ext", type: "address"},
                {name: "query_id", type: "uint64"},
            ]
            const slice = makeSlice("x{0000007B41423000000000000007FC_}") // From TwoInts32And64SepByAddress test
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.op).toBe(123n)
            expect(result.addr_ext).toBeInstanceOf(ExternalAddress)
            expect(result.query_id).toBe(BigInt(255))
        })

        it("should parse EdgeCaseInts with large numbers", () => {
            const fields: Field[] = [
                {name: "maxUint", type: "uint256"},
                {name: "maxInt", type: "int257"},
                {name: "minInt", type: "int257"},
            ]
            const maxUint =
                115_792_089_237_316_195_423_570_985_008_687_907_853_269_984_665_640_564_039_457_584_007_913_129_639_935n
            const maxInt =
                115_792_089_237_316_195_423_570_985_008_687_907_853_269_984_665_640_564_039_457_584_007_913_129_639_935n
            const minInt =
                -115_792_089_237_316_195_423_570_985_008_687_907_853_269_984_665_640_564_039_457_584_007_913_129_639_936n

            const slice = beginCell()
                .storeUint(maxUint, 256)
                .storeInt(maxInt, 257)
                .storeInt(minInt, 257)
                .endCell()
                .beginParse()
            const typeAbi = createMockTypeAbi(fields)

            const result = parseData(mockAbi, typeAbi, slice)

            expect(result.maxUint).toBe(maxUint)
            expect(result.maxInt).toBe(maxInt)
            expect(result.minInt).toBe(minInt)
        })
    })
})
