import {Address, Cell, ExternalAddress, TupleReader} from "@ton/core"
import {ContractAbi, TypeAbi, TypeInfo} from "@shared/abi"
import {AddressNone, ParsedObject, ParsedSlice} from "./types"
import {parseData, parseFieldValue} from "./decode"

function parseTupleAddress(reader: TupleReader): Address | ExternalAddress | AddressNone {
    const element = reader.peek()
    if (element.type === "slice" || element.type === "cell") {
        const slice = element.cell.asSlice().clone()
        if (slice.preloadUint(2) === 0) {
            return new AddressNone()
        }
    }

    try {
        return reader.readAddress()
    } catch {
        const addr = reader.readAddressOpt()
        return addr ?? new AddressNone()
    }
}

function parseTupleTypedCell(cell: Cell, typeInfo: TypeInfo, abi: ContractAbi): ParsedObject {
    const slice = cell.beginParse()

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

function parseTupleFieldValue(
    reader: TupleReader,
    typeInfo: TypeInfo,
    abi: ContractAbi,
): ParsedSlice {
    if (typeInfo.name === "option") {
        const nextItem = reader.peek()
        if (nextItem.type === "null") {
            reader.pop()
            return null
        }
        return parseTupleFieldValue(reader, typeInfo.innerType, abi)
    }

    if (typeInfo.name === "type-alias") {
        return parseTupleFieldValue(reader, typeInfo.innerType, abi)
    }

    switch (typeInfo.name) {
        case "int": {
            return reader.readBigNumber()
        }

        case "uint": {
            const value = reader.readBigNumber()
            if (value < 0) {
                throw new Error(`Unsigned integer cannot be negative: ${value}`)
            }
            return value
        }

        case "coins": {
            return reader.readBigNumber()
        }

        case "bool": {
            return reader.readBoolean()
        }

        case "address": {
            return parseTupleAddress(reader)
        }

        case "bits": {
            const cell = reader.readCell()
            const slice = cell.beginParse()
            return slice.loadBits(Math.min(typeInfo.width, slice.remainingBits))
        }

        case "cell": {
            const cell = reader.readCell()
            if (typeInfo.innerType) {
                const parsedInner = parseTupleTypedCell(cell, typeInfo.innerType, abi)
                return {
                    $: "nested-object" as const,
                    name: `Cell<${typeInfo.innerType.humanReadable}>`,
                    value: parsedInner,
                }
            }
            return cell
        }

        case "slice": {
            const cell = reader.readCell()
            return cell.beginParse()
        }

        case "varint16":
        case "varint32": {
            return reader.readBigNumber()
        }

        case "varuint16":
        case "varuint32": {
            const value = reader.readBigNumber()
            if (value < 0) {
                throw new Error(`Unsigned varint cannot be negative: ${value}`)
            }
            return value
        }

        case "struct": {
            const structTypeAbi = abi.types.find(t => t.name === typeInfo.structName)
            if (!structTypeAbi) {
                throw new Error(`Struct type '${typeInfo.structName}' not found in ABI`)
            }
            const tupleReader = reader.readTuple()
            const parsedStruct = parseTuple(abi, structTypeAbi, tupleReader)
            return {
                $: "nested-object" as const,
                name: typeInfo.structName,
                value: parsedStruct,
            }
        }

        case "anon-struct": {
            throw new Error("Anonymous struct should be handled earlier")
        }
        case "void": {
            throw new Error("Void type cannot be parsed")
        }
        default: {
            throw new Error("Unexpected type in tuple parsing")
        }
    }
}

/**
 * Parse data fields from a TupleReader using ABI type definition
 *
 * @param abi     Contract ABI contains type definitions for resolving nested types
 * @param typeAbi Type definition containing the fields to parse
 * @param reader  TupleReader with data to parse
 */
export function parseTuple(abi: ContractAbi, typeAbi: TypeAbi, reader: TupleReader): ParsedObject {
    const object: ParsedObject = {}

    for (const field of typeAbi.fields) {
        try {
            if (reader.remaining === 0) {
                throw new Error(`No more tuple items available for field '${field.name}'`)
            }
            object[field.name] = parseTupleFieldValue(reader, field.type, abi)
        } catch (error) {
            throw new Error(
                `Failed to parse tuple field '${field.name}' of type '${field.type.humanReadable}': ${error}`,
            )
        }
    }

    return object
}
