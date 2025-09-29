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

export class AddressNone {}
