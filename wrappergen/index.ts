import {filePathToUri, reparseTolkFile, TOLK_PARSED_FILES_CACHE} from "@server/files"
import {index as tolkIndex, IndexRoot as TolkIndexRoot} from "../server/src/languages/tolk/indexes"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {measureTime} from "@server/psi/utils"
import {initParser} from "@server/parser"
import {TolkIndexingRoot} from "@server/languages/tolk/indexing-root"
import {IndexingRootKind} from "@server/indexing/indexing"
import {typeOf} from "@server/languages/tolk/type-inference"
import {
    BoolTy,
    BuiltinTy,
    CoinsTy,
    InstantiationTy,
    IntNTy,
    IntTy,
    StructTy,
    Ty,
    TypeAliasTy,
    UnionTy,
    UnknownTy,
} from "@server/languages/tolk/types/ty"
import {Field} from "@server/languages/tolk/psi/Decls"
import * as fs from "node:fs"

export function findTolkFile(uri: string, content: string): TolkFile {
    const cached = TOLK_PARSED_FILES_CACHE.get(uri)
    if (cached !== undefined) {
        return cached
    }
    return measureTime(`reparse ${uri}`, () => reparseTolkFile(uri, content))
}

const main = async (): Promise<void> => {
    const wasmRoot = "/Users/petrmakhnev/ton-vscode-new/dist"
    await initParser(
        `${wasmRoot}/tree-sitter.wasm`,
        `${wasmRoot}/tree-sitter-tolk.wasm`,
        `${wasmRoot}/tree-sitter-func.wasm`,
        `${wasmRoot}/tree-sitter-fift.wasm`,
        `${wasmRoot}/tree-sitter-tlb.wasm`,
    )

    const stubsPath = `${wasmRoot}/stubs`
    const stubsUri = filePathToUri(stubsPath)
    tolkIndex.withStubsRoot(new TolkIndexRoot("stubs", stubsUri))

    console.info(`Using Tolk Stubs from ${stubsPath}`)

    const stubsRoot = new TolkIndexingRoot(stubsUri, IndexingRootKind.Stdlib)
    await stubsRoot.index()

    const stdlibPath = "/Users/petrmakhnev/ton-vscode-new/server/src/e2e/tolk/tolk-stdlib"
    const stdlibUri = filePathToUri(stdlibPath)
    tolkIndex.withStdlibRoot(new TolkIndexRoot("stdlib", stdlibUri))
    const stdlibRoot = new TolkIndexingRoot(stdlibUri, IndexingRootKind.Stdlib)
    await stdlibRoot.index()

    const root = "file:///Users/petrmakhnev/ton-vscode-new/wrappergen/workspace"
    tolkIndex.withRoots([new TolkIndexRoot("workspace", root)])
    const tolkWorkspaceRoot = new TolkIndexingRoot(root, IndexingRootKind.Workspace)
    await tolkWorkspaceRoot.index()

    const uri = `${root}/test.tolk`
    const file = findTolkFile(
        uri,
        `

type ForwardPayloadRemainder = RemainingBitsAndRefs

struct (0x0f8a7ea5) AskToTransfer {
    queryId: uint64
    jettonAmount: coins
    transferRecipient: address
    sendExcessesTo: address
    customPayload: cell?
    forwardTonAmount: coins
    forwardPayload: ForwardPayloadRemainder
}

struct (0x7362d09c) TransferNotificationForRecipient {
    queryId: uint64
    jettonAmount: coins
    transferInitiator: address
    forwardPayload: ForwardPayloadRemainder
}

struct (0x178d4519) InternalTransferStep {
    queryId: uint64
    jettonAmount: coins
    transferInitiator: address
    sendExcessesTo: address
    forwardTonAmount: coins
    forwardPayload: ForwardPayloadRemainder
}

struct (0xd53276db) ReturnExcessesBack {
    queryId: uint64
}

struct (0x595f07bc) AskToBurn {
    queryId: uint64
    jettonAmount: coins
    sendExcessesTo: address
    customPayload: cell?
}

struct (0x7bdd97de) BurnNotificationForMinter {
    queryId: uint64
    jettonAmount: coins
    burnInitiator: address
    sendExcessesTo: address
}

struct (0x2c76b973) RequestWalletAddress {
    queryId: uint64
    ownerAddress: address
    includeOwnerAddress: bool
}

struct (0xd1735400) ResponseWalletAddress {
    queryId: uint64
    jettonWalletAddress: address
    ownerAddress: Cell<address>?
}

struct (0x00000015) MintNewJettons {
    queryId: uint64
    mintRecipient: address
    tonAmount: coins
    internalTransferMsg: Cell<InternalTransferStep>
}

struct (0x00000003) ChangeMinterAdmin {
    queryId: uint64
    newAdminAddress: address
}

struct (0x00000004) ChangeMinterContent {
    queryId: uint64
    newContent: cell
}

`,
    )
    tolkIndex.addFile(uri, file)

    const structs = file.getStructs()
    const types = structs.map(struct => {
        const structTy = typeOf(struct.node, struct.file)
        if (!structTy) {
            return UnknownTy.UNKNOWN as Ty
        }

        return structTy
    })

    const ctx: Ctx = {dummy: 0}

    const wrappers = generateWrapper(ctx, types)
    console.log(wrappers)

    fs.writeFileSync(`main.wrapper.ts`, wrappers)
}

interface Ctx {
    readonly dummy: number
}

function generateWrapper(ctx: Ctx, types: Ty[]): string {
    const lines: string[] = []
    lines.push(
        `/* eslint-disable functional/type-declaration-immutability,@typescript-eslint/consistent-type-definitions,unicorn/numeric-separators-style */`,
        `import * as c from '@ton/core';\n`,
        `export function loadMaybeAny<T>(slice: c.Slice, cb: (s: c.Slice) => T): T | null {
    const isSet = slice.loadBit()
    if (isSet) {
        return cb(slice)
    }
    return null
}

function storeMaybeAny(builder: c.Builder, isNull: boolean, cb: (builder: c.Builder) => void): void {
    if (isNull) {
        builder.storeBit(0)
    } else {
        builder.storeBit(1)
        cb(builder)
    }
}
`,
    )

    for (const ty of types) {
        if (ty instanceof StructTy) {
            lines.push(generateStructWrapper(ctx, ty))
        }
    }

    return lines.join("\n")
}

function generateStructWrapper(ctx: Ctx, ty: StructTy): string {
    const def = generateStructDefinition(ctx, ty)
    const load = generateStructLoad(ctx, ty)
    const store = generateStructStore(ctx, ty)
    return def + "\n\n" + load + "\n" + store + "\n"
}

function generateStructDefinition(ctx: Ctx, ty: StructTy): string {
    const lines: string[] = []

    if (ty.anchor) {
        lines.push(
            ty.anchor.node.text
                .split("\n")
                .map(it => `// ${it}`)
                .join("\n"),
        )
    }

    const packPrefix = structPackPrefix(ty)
    if (packPrefix !== undefined) {
        const [prefix, bits] = packPrefix
        lines.push(`// Prefix: 0x${prefix.toString(16)}, prefix bits: ${bits}`)
    }

    lines.push(`type ${ty.name()} = {`, `    $: "${ty.name()}"`)

    for (const [index, field] of ty.fields().entries()) {
        const fieldTy = ty.fieldsTy[index] ?? UnknownTy.UNKNOWN
        lines.push(generateFieldDefinition(ctx, field, fieldTy))
    }

    lines.push(`}`)

    return lines.join("\n")
}

function generateFieldDefinition(ctx: Ctx, field: Field, ty: Ty): string {
    return `    ${field.name()}: ${generateFieldType(ctx, ty)} // ${ty.name()}`
}

function generateFieldType(ctx: Ctx, ty: Ty): string {
    if (ty instanceof IntTy) {
        return "bigint"
    }

    if (ty instanceof BoolTy) {
        return "boolean"
    }

    if (ty instanceof BuiltinTy) {
        if (ty.name() === "cell") {
            return "c.Cell"
        }
        if (ty.name() === "slice") {
            return "c.Slice"
        }
        if (ty.name() === "address") {
            return "c.Address"
        }
    }

    if (ty instanceof TypeAliasTy) {
        return generateFieldType(ctx, ty.innerTy)
    }

    if (ty instanceof UnionTy) {
        const asNullable = ty.asNullable()
        if (asNullable) {
            return generateFieldType(ctx, asNullable[0]) + " | null"
        }
    }

    if (ty instanceof InstantiationTy) {
        if (ty.innerTy.name() === "Cell") {
            const argTy = ty.types[0]
            if (argTy instanceof StructTy) {
                return generateFieldType(ctx, argTy)
            }
            return generateFieldType(ctx, argTy)
        }
    }

    if (ty instanceof StructTy) {
        return ty.name()
    }

    return ""
}

function structPackPrefix(ty: StructTy): [bigint, number] | undefined {
    const text = ty.anchor?.packPrefix()?.text
    if (!text) return undefined
    const value = BigInt(text)
    let prefixLen = value.toString(2).length
    if (text.startsWith("0x")) {
        prefixLen = (text.length - 2) * 4
    } else if (text.startsWith("0b")) {
        prefixLen = text.length - 2
    }
    return [value, prefixLen]
}

function generateStructLoad(ctx: Ctx, ty: StructTy): string {
    const lines: string[] = []

    lines.push(`export function load${ty.name()}(slice: c.Slice): ${ty.name()} {`)

    const packPrefix = structPackPrefix(ty)
    if (packPrefix !== undefined) {
        const [prefix, bits] = packPrefix
        lines.push(
            `    const opcode = BigInt(slice.loadUint(${bits}))`,
            `    if (opcode !== 0x${prefix.toString(16)}n) { throw new Error(\`Invalid prefix for ${ty.name()}, expected: 0x${prefix.toString(16)}, got: 0x\${opcode.toString(16)}\`) }`,
        )
    }

    for (const [index, field] of ty.fields().entries()) {
        const fieldTy = ty.fieldsTy[index] ?? UnknownTy.UNKNOWN
        lines.push(generateFieldLoadVariable(ctx, field, fieldTy))
    }

    const fieldNames = ty
        .fields()
        .map(it => it.name())
        .join(", ")

    lines.push(`    return { $: "${ty.name()}", ${fieldNames} }`, `}`, "")

    return lines.join("\n")
}

function generateFieldLoadVariable(ctx: Ctx, field: Field, ty: Ty): string {
    return `    const ${field.name()} = ${generateFieldLoad(ctx, ty)}`
}

function generateFieldLoad(ctx: Ctx, ty: Ty): string {
    if (ty instanceof IntNTy) {
        if (ty.unsigned) {
            return `BigInt(slice.loadUint(${ty.size}))`
        }
        return `BigInt(slice.loadInt(${ty.size}))`
    }

    if (ty instanceof CoinsTy) {
        return `slice.loadCoins()`
    }

    if (ty instanceof BoolTy) {
        return "slice.loadBit()"
    }

    if (ty instanceof BuiltinTy) {
        if (ty.name() === "cell") {
            return "slice.loadRef()"
        }
        if (ty.name() === "address") {
            return "slice.loadAddress()"
        }
    }

    if (ty instanceof TypeAliasTy) {
        if (ty.innerTy.name() === "RemainingBitsAndRefs") {
            return "slice // remaining data"
        }

        return generateFieldLoad(ctx, ty.innerTy)
    }

    if (ty instanceof UnionTy) {
        const asNullable = ty.asNullable()
        if (asNullable) {
            const inner = asNullable[0]
            if (inner.name() === "cell") {
                return "slice.loadMaybeRef()"
            }
            if (inner instanceof IntNTy) {
                if (inner.unsigned) {
                    return `slice.loadMaybeUint(${inner.size})`
                }
                return `slice.loadMaybeInt(${inner.size})`
            }
            if (inner instanceof InstantiationTy) {
                return `loadMaybeAny(slice, (slice) => ${generateFieldLoad(ctx, inner)})`
            }
        }
    }

    if (ty instanceof InstantiationTy) {
        if (ty.innerTy.name() === "Cell") {
            const argTy = ty.types[0]
            if (argTy instanceof StructTy) {
                return `load${argTy.name()}(slice.loadRef().asSlice())`
            }
            if (argTy.name() === "address") {
                return `slice.loadRef().asSlice().loadAddress()`
            }
            const load = generateFieldLoad(ctx, argTy)
            // TODO
            return "slice.loadRef().asSlice()"
        }
    }

    return ""
}

function generateStructStore(ctx: Ctx, ty: StructTy): string {
    const lines: string[] = []

    lines.push(
        `export function store${ty.name()}(data: ${ty.name()}) {`,
        `    return (builder: c.Builder): void => {`,
    )

    const packPrefix = structPackPrefix(ty)
    if (packPrefix !== undefined) {
        const [prefix, bits] = packPrefix
        lines.push(`        builder.storeUint(0x${prefix.toString(16)}n, ${bits})`)
    }

    for (const [index, field] of ty.fields().entries()) {
        const fieldTy = ty.fieldsTy[index] ?? UnknownTy.UNKNOWN
        lines.push(generateFieldStoreVariable(ctx, field, fieldTy))
    }

    lines.push("    }", "}")

    return lines.join("\n")
}

function generateFieldStoreVariable(ctx: Ctx, field: Field, ty: Ty): string {
    return `        ${generateFieldStore(ctx, field, ty)}`
}

function generateFieldStore(ctx: Ctx, field: Field, ty: Ty): string {
    const name = "data." + field.name()

    if (ty instanceof IntNTy) {
        if (ty.unsigned) {
            return `builder.storeUint(${name}, ${ty.size})`
        }
        return `builder.storeInt(${name}, ${ty.size})`
    }

    if (ty instanceof CoinsTy) {
        return `builder.storeCoins(${name})`
    }

    if (ty instanceof BoolTy) {
        return `builder.storeBit(${name})`
    }

    if (ty instanceof BuiltinTy) {
        if (ty.name() === "cell") {
            return `builder.storeRef(${name})`
        }
        if (ty.name() === "address") {
            return `builder.storeAddress(${name})`
        }
    }

    if (ty instanceof TypeAliasTy) {
        if (ty.innerTy.name() === "RemainingBitsAndRefs") {
            return `builder.storeSlice(${name})`
        }

        return generateFieldLoad(ctx, ty.innerTy)
    }

    if (ty instanceof UnionTy) {
        const asNullable = ty.asNullable()
        if (asNullable) {
            const inner = asNullable[0]
            if (inner.name() === "cell") {
                return `builder.storeMaybeRef(${name})`
            }
            if (inner instanceof IntNTy) {
                if (inner.unsigned) {
                    return `builder.storeMaybeUint(${name})`
                }
                return `builder.storeMaybeInt(${name})`
            }
            if (inner instanceof InstantiationTy) {
                return `storeMaybeAny(builder, ${name} === null, (builder) => ${generateFieldStore(ctx, field, inner)})`
            }
        }
    }

    if (ty instanceof InstantiationTy) {
        if (ty.innerTy.name() === "Cell") {
            const argTy = ty.types[0]
            if (argTy instanceof StructTy) {
                return `builder.storeRef(c.beginCell().store(store${argTy.name()}(${name})).endCell())`
            }
            if (argTy.name() === "address") {
                return `builder.storeRef(c.beginCell().storeAddress(${name}).endCell())`
            }
            const load = generateFieldLoad(ctx, argTy)
            // TODO
            return "builder.storeRef(c.beginCell().endCell())"
        }
    }

    return ""
}

void main()
