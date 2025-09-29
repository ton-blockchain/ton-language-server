import {TypeInfo} from "@shared/abi"
import * as binary from "./index"
import {Address, Cell} from "@ton/core"

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
        default: {
            return fieldValue
        }
    }
}
