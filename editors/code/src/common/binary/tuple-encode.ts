import {Address, beginCell, Cell, Slice, TupleBuilder, TupleItem} from "@ton/core"

import {ContractAbi, TypeAbi, TypeInfo} from "@shared/abi"

import {AddressNone, NestedObject, ParsedObject, ParsedSlice} from "./types"
import {encodeData, encodeFieldValue} from "./encode"

/**
 * Encode a parsed object to a tuple using ABI type definition
 *
 * @param abi     Contract ABI contains type definitions for resolving nested types
 * @param typeAbi Type definition containing the fields to encode
 * @param data    Parsed object with field values to encode
 */
export function encodeTuple(abi: ContractAbi, typeAbi: TypeAbi, data: ParsedObject): TupleItem[] {
    const builder = new TupleBuilder()

    for (const field of typeAbi.fields) {
        const value = data[field.name]
        if (value === undefined) {
            throw new Error(`Missing field '${field.name}' in data`)
        }
        encodeTupleFieldValue(builder, field.type, value, abi)
    }

    return builder.build()
}

function encodeTupleTypedData(abi: ContractAbi, typeInfo: TypeInfo, value: ParsedObject): Cell {
    if (typeInfo.name === "struct") {
        const structTypeAbi = abi.types.find(t => t.name === typeInfo.structName)
        if (!structTypeAbi) {
            throw new Error(`Struct type '${typeInfo.structName}' not found in ABI`)
        }
        return encodeData(abi, structTypeAbi, value)
    }

    if (typeInfo.name === "anon-struct") {
        const innerType = typeInfo.fields[0]
        const b = beginCell()
        encodeFieldValue(b, innerType, value.value as ParsedSlice, abi)
        return b.endCell()
    }

    throw new Error(`cannot encode Cell<${typeInfo.humanReadable}>`)
}

function encodeTupleFieldValue(
    builder: TupleBuilder,
    typeInfo: TypeInfo,
    value: ParsedSlice,
    abi: ContractAbi,
): void {
    if (typeInfo.name === "option") {
        if (value === null) {
            builder.writeNumber(null)
            return
        }
        encodeTupleFieldValue(builder, typeInfo.innerType, value, abi)
        return
    }

    if (typeInfo.name === "type-alias") {
        encodeTupleFieldValue(builder, typeInfo.innerType, value, abi)
        return
    }

    switch (typeInfo.name) {
        case "int": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for int type, got ${typeof value}`)
            }
            builder.writeNumber(value)
            break
        }

        case "uint": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for uint type, got ${typeof value}`)
            }
            if (value < 0) {
                throw new Error(`Unsigned integer cannot be negative: ${value}`)
            }
            builder.writeNumber(value)
            break
        }

        case "coins": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for coins type, got ${typeof value}`)
            }
            builder.writeNumber(value)
            break
        }

        case "bool": {
            if (typeof value !== "boolean") {
                throw new TypeError(`Expected boolean for bool type, got ${typeof value}`)
            }
            builder.writeBoolean(value)
            break
        }

        case "address": {
            if (value instanceof Address) {
                builder.writeAddress(value)
            } else if (value instanceof AddressNone) {
                builder.writeSlice(beginCell().storeUint(0, 2).asSlice())
            } else {
                builder.writeAddress(null)
            }
            break
        }

        case "bits": {
            if (!(value instanceof Slice)) {
                throw new TypeError(`Expected Slice for bits type, got ${typeof value}`)
            }
            builder.writeSlice(value.asCell())
            break
        }

        case "cell": {
            if (value instanceof Cell) {
                builder.writeCell(value)
            } else if (value && typeof value === "object" && "$" in value) {
                const nestedObj = value as NestedObject
                if (typeInfo.innerType && nestedObj.value !== undefined) {
                    const innerCell = encodeTupleTypedData(abi, typeInfo.innerType, nestedObj.value)
                    builder.writeCell(innerCell)
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
            builder.writeSlice(value.asCell())
            break
        }

        case "varint16": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for varint16 type, got ${typeof value}`)
            }
            builder.writeNumber(value)
            break
        }

        case "varint32": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for varint32 type, got ${typeof value}`)
            }
            builder.writeNumber(value)
            break
        }

        case "varuint16": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for varuint16 type, got ${typeof value}`)
            }
            if (value < 0) {
                throw new Error(`Unsigned varint cannot be negative: ${value}`)
            }
            builder.writeNumber(value)
            break
        }

        case "varuint32": {
            if (typeof value !== "bigint") {
                throw new TypeError(`Expected bigint for varuint32 type, got ${typeof value}`)
            }
            if (value < 0) {
                throw new Error(`Unsigned varint cannot be negative: ${value}`)
            }
            builder.writeNumber(value)
            break
        }

        case "struct": {
            if (!value || typeof value !== "object" || !("$" in value)) {
                throw new TypeError(`Expected NestedObject for struct type, got ${typeof value}`)
            }
            const nestedObj = value as NestedObject
            // if (nestedObj.name !== typeInfo.structName) {
            //     throw new TypeError(
            //         `Expected NestedObject with name '${typeInfo.structName}', got '${nestedObj.name}'`,
            //     )
            // }
            if (!nestedObj.value || typeof nestedObj.value !== "object") {
                throw new TypeError(
                    `Expected NestedObject with value for struct '${typeInfo.structName}'`,
                )
            }
            const structTypeAbi = abi.types.find(t => t.name === typeInfo.structName)
            if (!structTypeAbi) {
                throw new Error(`Struct type '${typeInfo.structName}' not found in ABI`)
            }
            const structTuple = encodeTuple(abi, structTypeAbi, nestedObj.value)
            builder.writeTuple(structTuple)
            break
        }

        case "anon-struct": {
            throw new Error('Not implemented yet: "anon-struct" case')
        }

        case "void": {
            // do nothing, void type is not encoded in tuples
            break
        }
        default: {
            throw new Error(`Unexpected type in tuple encoding`)
        }
    }
}
