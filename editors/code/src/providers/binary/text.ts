import {Address, Cell, ExternalAddress, Slice} from "@ton/core"

import {TypeInfo} from "@shared/abi"

import * as binary from "./index"
import {AddressNone, ParsedObject, ParsedSlice} from "./index"

export function parseStringFieldValue(fieldValue: string, fieldType: TypeInfo): binary.ParsedSlice {
    if (!fieldValue.trim()) {
        return null
    }

    switch (fieldType.name) {
        case "int":
        case "uint":
        case "coins":
        case "varint16":
        case "varint32":
        case "varuint16":
        case "varuint32": {
            return BigInt(fieldValue)
        }

        case "bool": {
            return fieldValue.toLowerCase() === "true" || fieldValue === "1"
        }

        case "address": {
            if (fieldValue === "null" || fieldValue === "") {
                return new binary.AddressNone()
            }
            try {
                return Address.parse(fieldValue)
            } catch {
                return new binary.AddressNone()
            }
        }

        case "bits":
        case "slice": {
            return binary.makeSlice(fieldValue)
        }

        case "cell": {
            if (fieldValue.startsWith("x{") || fieldValue.startsWith("b{")) {
                return binary.makeSlice(fieldValue).asCell()
            }
            return Cell.fromBase64(fieldValue)
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
