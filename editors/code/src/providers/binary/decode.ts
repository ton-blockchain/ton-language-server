import {Address, BitReader, Cell, ExternalAddress, Slice} from "@ton/core"
import {ContractAbi, TypeAbi} from "@shared/abi"

export type ParsedObject = Record<string, ParsedSlice>

export interface NestedObject {
    readonly $: "nested-object"
    readonly name: string
    readonly value: ParsedObject | undefined
}

export type ParsedSlice = Readonly<
    bigint | Address | ExternalAddress | Cell | Slice | NestedObject | boolean | null
>

type BaseTypeInfo =
    | {readonly name: "int"; readonly width: number}
    | {readonly name: "uint"; readonly width: number}
    | {readonly name: "coins"}
    | {readonly name: "bool"}
    | {readonly name: "address"}
    | {readonly name: "bits"; readonly width: number}
    | {readonly name: "cell"; readonly innerType?: string}
    | {readonly name: "slice"}
    | {readonly name: "varint16"}
    | {readonly name: "varint32"}
    | {readonly name: "varuint16"}
    | {readonly name: "varuint32"}

type TypeInfo = BaseTypeInfo | {readonly name: "option"; readonly innerType: BaseTypeInfo}

function parseTypeString(typeStr: string): TypeInfo {
    let type = typeStr.trim()
    let isOptional = false

    if (type.endsWith("?")) {
        isOptional = true
        type = type.slice(0, -1).trim()
    }

    let baseTypeInfo: BaseTypeInfo

    const cellMatch = /^Cell<(.+)>$/.exec(type)
    if (cellMatch) {
        baseTypeInfo = {
            name: "cell",
            innerType: cellMatch[1],
        }
    } else {
        const intMatch = /^(u?int)(\d+)$/.exec(type)
        if (intMatch) {
            const width = Number.parseInt(intMatch[2])
            baseTypeInfo = {
                name: intMatch[1] === "uint" ? "uint" : "int",
                width,
            }
        } else {
            const bitsMatch = /^bits(\d+)$/.exec(type)
            if (bitsMatch) {
                const width = Number.parseInt(bitsMatch[1])
                baseTypeInfo = {
                    name: "bits",
                    width,
                }
            } else {
                const bytesMatch = /^bytes(\d+)$/.exec(type)
                if (bytesMatch) {
                    const bitWidth = Number.parseInt(bytesMatch[1]) * 8
                    baseTypeInfo = {
                        name: "bits",
                        width: bitWidth,
                    }
                } else {
                    switch (type) {
                        case "coins": {
                            baseTypeInfo = {name: "coins"}
                            break
                        }
                        case "bool": {
                            baseTypeInfo = {name: "bool"}
                            break
                        }
                        case "address": {
                            baseTypeInfo = {name: "address"}
                            break
                        }
                        case "cell": {
                            baseTypeInfo = {name: "cell"}
                            break
                        }
                        case "slice": {
                            baseTypeInfo = {name: "slice"}
                            break
                        }
                        case "varint16": {
                            baseTypeInfo = {name: "varint16"}
                            break
                        }
                        case "varint32": {
                            baseTypeInfo = {name: "varint32"}
                            break
                        }
                        case "varuint16": {
                            baseTypeInfo = {name: "varuint16"}
                            break
                        }
                        case "varuint32": {
                            baseTypeInfo = {name: "varuint32"}
                            break
                        }
                        default: {
                            throw new Error(`Unsupported type: ${type}`)
                        }
                    }
                }
            }
        }
    }

    if (isOptional) {
        return {
            name: "option",
            innerType: baseTypeInfo,
        }
    }

    return baseTypeInfo
}

function parseAddress(slice: Slice): Address | ExternalAddress | null {
    const prefix = slice.preloadUint(2)
    if (prefix === 2) {
        return slice.loadAddress()
    }
    if (prefix === 0) {
        slice.skip(2)
        return null
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

function parseFieldValue(slice: Slice, typeInfo: TypeInfo, abi: ContractAbi): ParsedSlice {
    if (typeInfo.name === "option") {
        const hasValue = slice.loadBoolean()
        if (!hasValue) {
            return null
        }
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
                // For typed cells, we create a nested object
                const innerTypeInfo = parseTypeString(typeInfo.innerType)
                const cellSlice = cellRef.beginParse()
                const parsedInner = parseFieldValue(cellSlice, innerTypeInfo, abi)
                return {
                    $: "nested-object" as const,
                    name: `Cell<${typeInfo.innerType}>`,
                    value: {inner: parsedInner},
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
    }

    throw new Error(`unexpected type: ${JSON.stringify(typeInfo)}`)
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
    const slice = data.clone()

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
            const typeInfo = parseTypeString(field.type)
            object[field.name] = parseFieldValue(slice, typeInfo, abi)
        } catch (error) {
            throw new Error(
                `Failed to parse field '${field.name}' of type '${field.type}': ${error}`,
            )
        }
    }

    return object
}
