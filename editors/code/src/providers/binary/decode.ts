import {Address, BitReader, ExternalAddress, Slice} from "@ton/core"
import {ContractAbi, TypeAbi, TypeInfo} from "@shared/abi"
import {AddressNone, ParsedObject, ParsedSlice} from "./types"

function parseAddress(slice: Slice): Address | ExternalAddress | AddressNone {
    const prefix = slice.preloadUint(2)
    if (prefix === 2) {
        return slice.loadAddress()
    }
    if (prefix === 0) {
        slice.skip(2)
        return new AddressNone()
    }
    if (prefix === 1) {
        return slice.loadExternalAddress()
    }
    throw new Error("Incorrect address kind while deserializing")
}

function parseBits(slice: Slice, bitWidth: number): Slice {
    const bits = slice.loadBits(bitWidth)
    return new Slice(new BitReader(bits), [])
}

function parseTypedCell(slice: Slice, typeInfo: TypeInfo, abi: ContractAbi): ParsedObject {
    if (typeInfo.name === "struct") {
        const structTypeAbi = abi.types.find(t => t.name === typeInfo.structName)
        if (!structTypeAbi) {
            throw new Error(`Struct type '${typeInfo.structName}' not found in ABI`)
        }
        return parseData(abi, structTypeAbi, slice)
    }

    if (typeInfo.name === "anon-struct") {
        const innerType = typeInfo.fields[0]
        return {
            value: parseFieldValue(slice, innerType, abi),
        }
    }

    return {
        value: parseFieldValue(slice, typeInfo, abi),
    }
}

function parseFieldValue(slice: Slice, typeInfo: TypeInfo, abi: ContractAbi): ParsedSlice {
    if (typeInfo.name === "option") {
        const hasValue = slice.loadBoolean()
        if (!hasValue) {
            return null
        }
        return parseFieldValue(slice, typeInfo.innerType, abi)
    }

    if (typeInfo.name === "type-alias") {
        return parseFieldValue(slice, typeInfo.innerType, abi)
    }

    switch (typeInfo.name) {
        case "int": {
            return slice.loadIntBig(typeInfo.width)
        }

        case "uint": {
            return slice.loadUintBig(typeInfo.width)
        }

        case "coins": {
            return slice.loadCoins()
        }

        case "bool": {
            return slice.loadBoolean()
        }

        case "address": {
            return parseAddress(slice)
        }

        case "bits": {
            return parseBits(slice, typeInfo.width)
        }

        case "cell": {
            const cellRef = slice.loadRef()
            if (typeInfo.innerType) {
                const cellSlice = cellRef.beginParse()
                const parsedInner = parseTypedCell(cellSlice, typeInfo.innerType, abi)
                return {
                    $: "nested-object" as const,
                    name: `Cell<${typeInfo.innerType.humanReadable}>`,
                    value: parsedInner,
                }
            }
            return cellRef
        }

        case "slice": {
            const rest = slice.clone()
            slice.loadBits(slice.remainingBits)
            while (slice.remainingRefs) {
                slice.loadRef()
            }
            return rest
        }

        case "varint16": {
            return slice.loadVarIntBig(4)
        }

        case "varint32": {
            return slice.loadVarIntBig(5)
        }

        case "varuint16": {
            return slice.loadVarUintBig(4)
        }

        case "varuint32": {
            return slice.loadVarUintBig(5)
        }

        case "struct": {
            const structTypeAbi = abi.types.find(t => t.name === typeInfo.structName)
            if (!structTypeAbi) {
                throw new Error(`Struct type '${typeInfo.structName}' not found in ABI`)
            }
            const parsedStruct = parseData(abi, structTypeAbi, slice)
            return {
                $: "nested-object" as const,
                name: typeInfo.structName,
                value: parsedStruct,
            }
        }
        case "anon-struct": {
            throw new Error("Anonymous struct should be handled earlier")
        }
    }

    throw new Error(`unexpected type`)
}

/**
 * Parse data fields from a slice using ABI type definition
 *
 * @param abi     Contract ABI contains type definitions for resolving nested types
 * @param typeAbi Type definition containing the fields to parse
 * @param data    Slice with data to parse
 */
export function parseData(abi: ContractAbi, typeAbi: TypeAbi, data: Slice): ParsedObject {
    const object: ParsedObject = {}
    const slice = data

    if (typeAbi.opcode !== undefined && typeAbi.opcodeWidth !== undefined) {
        const actualOpcode = slice.loadUint(typeAbi.opcodeWidth)
        if (actualOpcode !== typeAbi.opcode) {
            throw new Error(
                `Invalid opcode for type '${typeAbi.name}': expected 0x${typeAbi.opcode.toString(16)}, got 0x${actualOpcode.toString(16)}`,
            )
        }
    }

    for (const field of typeAbi.fields) {
        try {
            object[field.name] = parseFieldValue(slice, field.type, abi)
        } catch (error) {
            throw new Error(
                `Failed to parse field '${field.name}' of type '${field.type.humanReadable}': ${error}`,
            )
        }
    }

    return object
}
