export interface ContractAbi {
    readonly name: string
    readonly storage: Storage | undefined
    readonly types: TypeAbi[]
    readonly messages: readonly TypeAbi[]
    readonly getMethods: readonly GetMethod[]
    readonly entryPoint: EntryPoint | undefined
    readonly externalEntryPoint: EntryPoint | undefined
}

export interface EntryPoint {
    readonly pos: Pos | undefined
}

export interface Storage {
    readonly fields: readonly Field[]
}

export interface TypeAbi {
    readonly name: string
    readonly opcode: number | undefined
    readonly opcodeWidth: number | undefined
    readonly fields: readonly Field[]
}

export interface Field {
    readonly name: string
    readonly type: string
}

export interface GetMethod {
    readonly name: string
    readonly id: number
    readonly pos: Pos | undefined
}

export interface Pos {
    readonly row: number
    readonly column: number
}
