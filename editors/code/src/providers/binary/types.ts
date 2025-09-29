import {Address, Cell, ExternalAddress, Slice} from "@ton/core"

export type ParsedObject = Record<string, ParsedSlice | undefined>

export interface NestedObject {
    readonly $: "nested-object"
    readonly name: string
    readonly value: ParsedObject | undefined
}

export type ParsedSlice = Readonly<
    bigint | Address | ExternalAddress | AddressNone | Cell | Slice | NestedObject | boolean | null
>

export class AddressNone {
    public toString(): string {
        return "addr_none"
    }
}

export function formatParsedSlice(value: ParsedSlice | undefined): string {
    if (value === undefined || value === null) {
        return "null"
    }

    if (typeof value === "boolean") {
        return value ? "true" : "false"
    }

    if (typeof value === "bigint") {
        return value.toString()
    }

    if (typeof value === "object") {
        if ("$" in value) {
            return `${value.name}: ${JSON.stringify(value.value)}`
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
            return value.toString()
        }

        if (value instanceof Slice) {
            return value.toString()
        }
    }

    return ""
}
