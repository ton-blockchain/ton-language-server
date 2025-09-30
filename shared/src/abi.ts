export type BaseTypeInfo =
    | {readonly name: "void"}
    | {readonly name: "int"; readonly width: number}
    | {readonly name: "uint"; readonly width: number}
    | {readonly name: "coins"}
    | {readonly name: "bool"}
    | {readonly name: "address"}
    | {readonly name: "bits"; readonly width: number}
    | {readonly name: "cell"; readonly innerType?: TypeInfo}
    | {readonly name: "slice"}
    | {readonly name: "varint16"}
    | {readonly name: "varint32"}
    | {readonly name: "varuint16"}
    | {readonly name: "varuint32"}
    | {readonly name: "struct"; readonly structName: string}
    | {readonly name: "anon-struct"; readonly fields: readonly TypeInfo[]}

export type TypeInfo = (
    | BaseTypeInfo
    | {readonly name: "option"; readonly innerType: TypeInfo}
    | {readonly name: "type-alias"; readonly aliasName: string; readonly innerType: TypeInfo}
) & {
    readonly humanReadable: string
}

export interface ContractAbi {
    readonly name: string
    readonly storage: TypeAbi | undefined
    readonly types: TypeAbi[]
    readonly messages: readonly TypeAbi[]
    readonly getMethods: readonly GetMethod[]
    readonly entryPoint: EntryPoint | undefined
    readonly externalEntryPoint: EntryPoint | undefined
}

export interface EntryPoint {
    readonly pos: Pos | undefined
}

export interface TypeAbi {
    readonly name: string
    readonly opcode: number | undefined
    readonly opcodeWidth: number | undefined
    readonly fields: readonly Field[]
}

export interface Field {
    readonly name: string
    readonly type: TypeInfo
}

export interface GetMethod {
    readonly name: string
    readonly id: number
    readonly pos: Pos | undefined
    readonly returnType?: TypeInfo
    readonly parameters?: Field[]
}

export interface Pos {
    readonly row: number
    readonly column: number
}
