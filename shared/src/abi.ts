export interface ContractAbi {
    readonly name: string
    readonly storage: Storage | undefined
    readonly messages: readonly Message[]
    readonly getMethods: readonly GetMethod[]
    readonly entryPoint: EntryPoint | undefined
}

export interface EntryPoint {
    readonly pos: Pos | undefined
}

export interface Storage {
    readonly fields: readonly Field[]
}

export interface Message {
    readonly name: string
    readonly opcode: number
    readonly opcodeWidth: number
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
