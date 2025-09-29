import {Address, beginCell, Builder, Cell, ExternalAddress, Slice} from "@ton/core"
import {ContractAbi, TypeAbi, TypeInfo} from "@shared/abi"
import {ParsedObject, ParsedSlice, NestedObject} from "./decode"

/**
 * Encode a parsed object back to a slice using ABI type definition
 *
 * @param abi     Contract ABI contains type definitions for resolving nested types
 * @param typeAbi Type definition containing the fields to encode
 * @param data    Parsed object with field values to encode
 */
export function encodeData(abi: ContractAbi, typeAbi: TypeAbi, data: ParsedObject): Cell {
    const builder = beginCell()

    if (typeAbi.opcode !== undefined && typeAbi.opcodeWidth !== undefined) {
        builder.storeUint(typeAbi.opcode, typeAbi.opcodeWidth)
    }

    for (const field of typeAbi.fields) {
        const value = data[field.name]
        if (value === undefined) {
            throw new Error(`Missing field '${field.name}' in data`)
        }
        encodeFieldValue(builder, field.type, value, abi)
    }

    return builder.endCell()
}

function encodeTypedCell(abi: ContractAbi, typeInfo: TypeInfo, value: ParsedObject): Cell {
    const builder = beginCell()

    if (typeInfo.name === "struct") {
        const structTypeAbi = abi.types.find(t => t.name === typeInfo.structName)
        if (!structTypeAbi) {
            throw new Error(`Struct type '${typeInfo.structName}' not found in ABI`)
        }
        return encodeData(abi, structTypeAbi, value)
    }

    if (typeInfo.name === "anon-struct") {
        const innerType = typeInfo.fields[0]
        encodeFieldValue(builder, innerType, value.value as ParsedSlice, abi)
        return builder.endCell()
    }

    throw new Error(`cannot encode Cell<${typeInfo.humanReadable}>`)
}

function encodeFieldValue(
    builder: Builder,
    typeInfo: TypeInfo,
    value: ParsedSlice,
    abi: ContractAbi,
): void {
    if (typeInfo.name === "option") {
        if (value === null) {
            builder.storeBit(0)
            return
        }
        builder.storeBit(1)
        encodeFieldValue(builder, typeInfo.innerType, value, abi)
        return
    }

    if (typeInfo.name === "type-alias") {
        encodeFieldValue(builder, typeInfo.innerType, value, abi)
        return
    }

    switch (typeInfo.name) {
        case "int": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for int type, got ${typeof value}`)
            }
            builder.storeInt(value, typeInfo.width)
            break
        }

        case "uint": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for uint type, got ${typeof value}`)
            }
            builder.storeUint(value, typeInfo.width)
            break
        }

        case "coins": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for coins type, got ${typeof value}`)
            }
            builder.storeCoins(value)
            break
        }

        case "bool": {
            if (typeof value !== "boolean") {
                throw new TypeError(`Expected boolean for bool type, got ${typeof value}`)
            }
            builder.storeBit(value ? 1 : 0)
            break
        }

        case "address": {
            if (value instanceof Address || value instanceof ExternalAddress || value === null) {
                builder.storeAddress(value)
            } else {
                throw new TypeError(
                    `Expected Address, ExternalAddress or null for address type, got ${typeof value}`,
                )
            }
            break
        }

        case "bits": {
            if (!(value instanceof Slice)) {
                throw new TypeError(`Expected Slice for bits type, got ${typeof value}`)
            }
            const bits = value.loadBits(value.remainingBits)
            builder.storeBits(bits)
            break
        }

        case "cell": {
            if (value instanceof Cell) {
                builder.storeRef(value)
            } else if (value && typeof value === "object" && "$" in value) {
                const nestedObj = value as NestedObject
                if (typeInfo.innerType && nestedObj.value !== undefined) {
                    const innerCell = encodeTypedCell(abi, typeInfo.innerType, nestedObj.value)
                    builder.storeRef(innerCell)
                } else {
                    throw new Error(`Invalid nested object for typed cell`)
                }
            } else {
                throw new Error(`Expected Cell or nested object for cell type, got ${typeof value}`)
            }
            break
        }

        case "slice": {
            if (!(value instanceof Slice)) {
                throw new TypeError(`Expected Slice for slice type, got ${typeof value}`)
            }
            builder.storeSlice(value)
            break
        }

        case "varint16": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for varint16 type, got ${typeof value}`)
            }
            builder.storeVarInt(value, 4)
            break
        }

        case "varint32": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for varint32 type, got ${typeof value}`)
            }
            builder.storeVarInt(value, 5)
            break
        }

        case "varuint16": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for varuint16 type, got ${typeof value}`)
            }
            builder.storeVarUint(value, 4)
            break
        }

        case "varuint32": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for varuint32 type, got ${typeof value}`)
            }
            builder.storeVarUint(value, 5)
            break
        }

        case "struct": {
            if (!value || typeof value !== "object" || !("$" in value)) {
                throw new TypeError(`Expected NestedObject for struct type, got ${typeof value}`)
            }
            const nestedObj = value
            if (nestedObj.name !== typeInfo.structName) {
                throw new TypeError(
                    `Expected NestedObject with name '${typeInfo.structName}', got '${nestedObj.name}'`,
                )
            }
            if (!nestedObj.value || typeof nestedObj.value !== "object") {
                throw new TypeError(
                    `Expected NestedObject with value for struct '${typeInfo.structName}'`,
                )
            }
            const structTypeAbi = abi.types.find(t => t.name === typeInfo.structName)
            if (!structTypeAbi) {
                throw new Error(`Struct type '${typeInfo.structName}' not found in ABI`)
            }
            const structCell = encodeData(abi, structTypeAbi, nestedObj.value)
            builder.storeSlice(structCell.beginParse())
            break
        }
        case "anon-struct": {
            throw new Error('Not implemented yet: "anon-struct" case')
        }
    }
}
