import {Address, beginCell, Cell, ExternalAddress, Slice, toNano} from "@ton/core"

import {TypeInfo} from "@shared/abi"

import * as binary from "./index"
import {AddressNone, ParsedObject, ParsedSlice, unflattenParsedObject} from "./index"

export type RawStringObject = Record<string, {type: TypeInfo; value: string} | undefined>

export function rawStringObjectToParsedObject(obj: RawStringObject): ParsedObject {
    const messageFields: binary.FlattenParsedObject = {}

    Object.entries(obj).map(([fieldPath, val]) => {
        if (!val) return

        const {type, value} = val

        let parsedValue: binary.ParsedSlice
        try {
            parsedValue = parseStringFieldValue(value, type)
        } catch {
            parsedValue = value
        }
        messageFields[fieldPath] = parsedValue
    })

    return unflattenParsedObject(messageFields)
}

function parseSliceLiteral(fieldValue: string, fieldType: TypeInfo): Slice {
    if (fieldValue.startsWith("te6")) {
        return Cell.fromBase64(fieldValue).asSlice()
    }
    if (fieldValue.startsWith("b5e")) {
        return Cell.fromHex(fieldValue).asSlice()
    }
    if ((fieldValue.startsWith("x{") || fieldValue.startsWith("b{")) && fieldValue.endsWith("}")) {
        return binary.makeSlice(fieldValue)
    }
    if (fieldValue.startsWith('"') && fieldValue.endsWith('"')) {
        const stringContent = fieldValue.slice(1, -1)
        return beginCell().storeBuffer(Buffer.from(stringContent, "utf8")).asSlice()
    }

    throw new Error(`Invalid '${fieldType.humanReadable}' literal`)
}

export function parseStringFieldValue(
    rawFieldValue: string,
    fieldType: TypeInfo,
): binary.ParsedSlice {
    if (!rawFieldValue.trim()) {
        return null
    }

    const fieldValue = rawFieldValue.trim()

    switch (fieldType.name) {
        case "int":
        case "uint":
        case "varint16":
        case "varint32":
        case "varuint16":
        case "varuint32": {
            return BigInt(fieldValue)
        }

        case "coins": {
            if (fieldValue.trim() === "") {
                return 0
            }
            return toNano(fieldValue)
        }

        case "bool": {
            return fieldValue.toLowerCase() === "true"
        }

        case "address": {
            if (fieldValue === "null" || fieldValue === "none" || fieldValue === "") {
                return new binary.AddressNone()
            }
            try {
                return Address.parse(fieldValue)
            } catch {
                throw new Error(`Invalid address value`)
            }
        }

        case "bits":
        case "slice": {
            return parseSliceLiteral(fieldValue, fieldType)
        }

        case "cell": {
            return parseSliceLiteral(fieldValue, fieldType).asCell()
        }

        case "option": {
            if (fieldValue === "null" || fieldValue === "") {
                return null
            }
            return parseStringFieldValue(fieldValue, fieldType.innerType)
        }

        case "type-alias": {
            return parseStringFieldValue(fieldValue, fieldType.innerType)
        }

        case "struct": {
            throw new Error('Not implemented yet: "struct" case')
        }
        case "anon-struct": {
            throw new Error('Not implemented yet: "anon-struct" case')
        }
        case "void": {
            throw new Error('Not implemented yet: "void" case')
        }
        default: {
            return fieldValue
        }
    }
}

export function formatParsedObject(object: ParsedObject, indent: string = ""): string {
    let result = `${indent}{\n`

    const entries = Object.entries(object)
    for (const [key, value] of entries) {
        result += `${indent}    ${key}: `
        result += formatParsedSlice(value, indent + "    ")
        result += ",\n"
    }

    if (entries.length > 0) {
        result = result.slice(0, -2) + "\n"
    }

    result += `${indent}}\n`
    return result
}

export function formatParsedSlice(
    value: ParsedSlice | undefined,
    indent: string = "",
): string | undefined {
    if (value === undefined || value === null) {
        return undefined
    }

    if (typeof value === "boolean") {
        return value ? "true" : "false"
    }

    if (typeof value === "bigint") {
        return value.toString()
    }

    if (typeof value === "object") {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if ("$" in value && value.$ === "nested-object") {
            return formatParsedObject(value, indent + "    ")
        }

        if (value instanceof AddressNone) {
            return value.toString()
        }

        if (value instanceof Address) {
            return value.toString()
        }

        if (value instanceof ExternalAddress) {
            return value.toString()
        }

        if (value instanceof Cell) {
            return value.toBoc().toString("base64")
        }

        if (value instanceof Slice) {
            return value.toString()
        }
    }

    return ""
}
