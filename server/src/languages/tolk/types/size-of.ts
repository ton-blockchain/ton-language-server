import {
    type Ty,
    StructTy,
    TypeAliasTy,
    TensorTy,
    TupleTy,
    UnionTy,
    FuncTy,
    TypeParameterTy,
    InstantiationTy,
    BuiltinTy,
    IntTy,
    IntNTy,
    VarIntNTy,
    CoinsTy,
    BoolTy,
    BitsNTy,
    BytesNTy,
    NullTy,
    VoidTy,
    UnknownTy,
    NeverTy,
} from "@server/languages/tolk/types/ty"
import {GenericSubstitutions, typeOf} from "@server/languages/tolk/type-inference"

export interface SizeOf {
    readonly valid: boolean
    readonly minBits: number
    readonly maxBits: number
    readonly minRefs: number
    readonly maxRefs: number
}

export enum PrefixEstimateMode {
    IncludePrefixOfStruct = "IncludePrefixOfStruct",
    DoNothingAlreadyIncluded = "DoNothingAlreadyIncluded",
}

export class EstimateContext {
    private prefixMode: PrefixEstimateMode = PrefixEstimateMode.IncludePrefixOfStruct
    private readonly visited: Map<string, SizeOf> = new Map()

    public getPrefixMode(): PrefixEstimateMode {
        return this.prefixMode
    }

    public static minmax(a: SizeOf, b: SizeOf): SizeOf {
        if (!a.valid || !b.valid) {
            return createInvalidSizeOf()
        }

        return {
            valid: true,
            minBits: Math.min(a.minBits, b.minBits),
            maxBits: Math.max(a.maxBits, b.maxBits),
            minRefs: Math.min(a.minRefs, b.minRefs),
            maxRefs: Math.max(a.maxRefs, b.maxRefs),
        }
    }

    public static sum(a: SizeOf, b: SizeOf): SizeOf {
        if (!a.valid || !b.valid) {
            return createInvalidSizeOf()
        }

        return {
            valid: true,
            minBits: a.minBits + b.minBits,
            maxBits: Math.min(9999, a.maxBits + b.maxBits),
            minRefs: a.minRefs + b.minRefs,
            maxRefs: a.maxRefs + b.maxRefs,
        }
    }

    public static estimate(type: Ty): SizeOf {
        return new EstimateContext().estimateAny(type)
    }

    public estimateAny(
        type: Ty,
        prefixMode: PrefixEstimateMode = PrefixEstimateMode.IncludePrefixOfStruct,
    ): SizeOf {
        const backup = this.prefixMode
        this.prefixMode = prefixMode
        const result = this.sizeOf(type)
        this.prefixMode = backup
        return result
    }

    private sizeOf(ty: Ty): SizeOf {
        const typeName = ty.name()
        const cached = this.visited.get(typeName)
        if (cached) {
            return cached
        }

        const actual = calculateSizeOf(ty, this)
        this.visited.set(typeName, actual)
        return actual
    }
}

export function createSizeOf(
    minBits: number,
    maxBits?: number,
    minRefs?: number,
    maxRefs?: number,
): SizeOf {
    return {
        valid: true,
        minBits: minBits,
        maxBits: maxBits ?? minBits,
        minRefs: minRefs ?? 0,
        maxRefs: maxRefs ?? minRefs ?? 0,
    }
}

export function createInvalidSizeOf(): SizeOf {
    return {
        valid: false,
        minBits: 0,
        maxBits: 0,
        minRefs: 0,
        maxRefs: 0,
    }
}

export function createUnpredictableInfinitySizeOf(): SizeOf {
    return {
        valid: true,
        minBits: 0,
        maxBits: 9999,
        minRefs: 0,
        maxRefs: 4,
    }
}

export function sizeOfPresentation(size: SizeOf): string {
    if (!size.valid) {
        return "unknown or invalid size"
    }
    if (size.minBits === size.maxBits && size.minRefs === size.maxRefs) {
        if (size.minRefs === 0) {
            return `${size.minBits} bits`
        }
        return `${size.minBits} bits, ${size.minRefs} refs`
    }
    return `${formatRange(size.minBits, size.maxBits, "bit")}, ${formatRange(size.minRefs, size.maxRefs, "ref")}`
}

function formatRange(first: number, second: number, name: string): string {
    if (first === second) {
        if (first === 1) {
            return `${first} ${name}`
        }
        return first.toString() + " " + name + "s"
    }

    return `${first}..${second} ${name}s`
}

function calculateSizeOf(ty: Ty, ctx: EstimateContext): SizeOf {
    if (ty instanceof StructTy) {
        let sum = createSizeOf(0)

        const packPrefixNode = ty.anchor?.packPrefix()
        if (packPrefixNode && ctx.getPrefixMode() === PrefixEstimateMode.IncludePrefixOfStruct) {
            try {
                const prefixStr = packPrefixNode.text
                const packPrefix = BigInt(prefixStr)
                if (packPrefix >= 0) {
                    let prefixLen = packPrefix.toString(2).length
                    if (prefixStr.startsWith("0x")) {
                        prefixLen = (prefixStr.length - 2) * 4
                    } else if (prefixStr.startsWith("0b")) {
                        prefixLen = prefixStr.length - 2
                    }
                    sum = EstimateContext.sum(sum, createSizeOf(prefixLen))
                }
            } catch {
                // invalid prefix, ignore
            }
        }

        if (ty.fieldsTy.length === 0) {
            // fallback
            const fields = ty.fields()
            for (const field of fields) {
                const nameNode = field.nameNode()
                if (!nameNode) return createInvalidSizeOf()
                const fieldTy = typeOf(nameNode.node, nameNode.file)
                if (!fieldTy) return createInvalidSizeOf()

                const fieldSize = ctx.estimateAny(fieldTy)
                sum = EstimateContext.sum(sum, fieldSize)
            }
        } else {
            for (const field of ty.fieldsTy) {
                const fieldSize = ctx.estimateAny(field)
                sum = EstimateContext.sum(sum, fieldSize)
            }
        }

        return sum
    }

    if (ty instanceof TypeAliasTy) {
        return ctx.estimateAny(ty.innerTy)
    }

    if (ty instanceof TensorTy) {
        let sum = createSizeOf(0)
        for (const element of ty.elements) {
            const size = ctx.estimateAny(element)
            sum = EstimateContext.sum(sum, size)
        }
        return sum
    }

    if (ty instanceof TupleTy) {
        let sum = createSizeOf(0)
        for (const element of ty.elements) {
            const size = ctx.estimateAny(element)
            sum = EstimateContext.sum(sum, size)
        }
        return sum
    }

    if (ty instanceof UnionTy) {
        const asNullable = ty.asNullable()
        if (asNullable) {
            // Maybe type (T?)
            const maybeSize = ctx.estimateAny(asNullable[0])
            return EstimateContext.sum(
                createSizeOf(1),
                createSizeOf(maybeSize.minBits, maybeSize.maxBits, 0, maybeSize.maxRefs),
            )
        }

        if (ty.elements.length === 2 && ty.elements.every(it => !hasOpcode(it))) {
            // Either type (exactly 2 variants without opcodes)
            const leftSize = ctx.estimateAny(ty.elements[0])
            const rightSize = ctx.estimateAny(ty.elements[1])
            const eitherSize = EstimateContext.minmax(leftSize, rightSize)
            return EstimateContext.sum(createSizeOf(1), eitherSize)
        }

        if (ty.elements.length > 0) {
            // multiple constructors case, mirrors S_MultipleConstructors::estimate()
            // generate opcodes to get accurate prefix sizes
            const opcodes = autoGenerateOpcodesForUnion(ty)

            if (!opcodes) {
                // invalid union configuration, return invalid size
                return createInvalidSizeOf()
            }

            // calculate variants size using the first variant as baseline
            let variantsSize = ctx.estimateAny(
                ty.elements[0],
                PrefixEstimateMode.DoNothingAlreadyIncluded,
            )

            // use the actual opcode prefix size
            let prefixSize = createSizeOf(opcodes[0].prefixLen)

            for (let i = 1; i < ty.elements.length; i++) {
                const nextVariantSize = ctx.estimateAny(
                    ty.elements[i],
                    PrefixEstimateMode.DoNothingAlreadyIncluded,
                )
                variantsSize = EstimateContext.minmax(variantsSize, nextVariantSize)

                // use actual prefix length from generated opcodes
                prefixSize = EstimateContext.minmax(prefixSize, createSizeOf(opcodes[i].prefixLen))
            }

            return EstimateContext.sum(variantsSize, prefixSize)
        }

        return createInvalidSizeOf()
    }

    if (ty instanceof FuncTy) {
        // functions are not directly serializable
        return createUnpredictableInfinitySizeOf()
    }

    if (ty instanceof TypeParameterTy) {
        // type parameters have unknown size until substituted
        return createUnpredictableInfinitySizeOf()
    }

    if (ty instanceof InstantiationTy) {
        if (ty.innerTy.name() === "Cell") {
            // Cell<Foo>, same as cell
            return createSizeOf(0, 0, 1, 1)
        }
        if (ty.innerTy.name() === "map") {
            // mao<int32, slice>, same as cell?
            return createSizeOf(0, 1, 0, 1)
        }

        if (ty.innerTy instanceof StructTy || ty.innerTy instanceof TypeAliasTy) {
            const parameters = ty.innerTy.anchor?.typeParameters() ?? []
            const types = ty.types

            const mapping: Map<string, Ty> = new Map()

            for (let i = 0; i < Math.min(parameters.length, types.length); i++) {
                GenericSubstitutions.deduceTo(mapping, new TypeParameterTy(parameters[i]), types[i])
            }

            return calculateSizeOf(ty.innerTy.substitute(mapping), ctx)
        }

        // for instantiated types, use unpredictable size, TODO
        return createUnpredictableInfinitySizeOf()
    }

    if (ty instanceof BuiltinTy) {
        const name = ty.name()
        if (name === "address") {
            // we can't do just
            // return PackSize(2 + 1 + 8 + 256);
            // because it may be addr_none or addr_extern; but since addr_extern is very-very uncommon, don't consider it
            return createSizeOf(2, 2 + 1 + 8 + 256)
        }
        if (name === "cell") {
            // S_RawTVMcell::estimate()
            return createSizeOf(0, 0, 1, 1)
        }
        if (name === "builder") {
            // S_Builder::estimate()
            return createUnpredictableInfinitySizeOf()
        }
        if (name === "slice") {
            // S_Slice::estimate()
            return createUnpredictableInfinitySizeOf()
        }
        return createSizeOf(0)
    }

    if (ty instanceof IntNTy && !(ty instanceof VarIntNTy)) {
        return createSizeOf(ty.size)
    }

    if (ty instanceof VarIntNTy) {
        if (ty.size === 32) {
            return createSizeOf(5, 253)
        }
        // size == 16
        return createSizeOf(4, 124) // same as coins
    }

    if (ty instanceof CoinsTy) {
        return createSizeOf(4, 124)
    }

    if (ty instanceof IntTy) {
        return createSizeOf(257)
    }

    if (ty instanceof BoolTy) {
        return createSizeOf(1)
    }

    if (ty instanceof BitsNTy) {
        return createSizeOf(ty.size)
    }

    if (ty instanceof BytesNTy) {
        return createSizeOf(ty.size * 8)
    }

    if (ty instanceof NullTy) {
        return createSizeOf(0)
    }

    if (ty instanceof VoidTy) {
        return createInvalidSizeOf()
    }

    if (ty instanceof UnknownTy) {
        return createInvalidSizeOf()
    }

    if (ty instanceof NeverTy) {
        return createSizeOf(0)
    }

    return createInvalidSizeOf()
}

function hasOpcode(ty: Ty): boolean {
    if (ty instanceof StructTy) {
        return ty.anchor?.packPrefix() !== null
    }
    return false
}

export interface PackOpcode {
    readonly prefix: number
    readonly prefixLen: number
}

export function createPackOpcode(prefix: number, prefixLen: number): PackOpcode {
    return {prefix, prefixLen}
}

export function autoGenerateOpcodesForUnion(unionType: UnionTy): PackOpcode[] | undefined {
    const variants = unionType.elements
    const result: PackOpcode[] = []

    let nHaveOpcode = 0
    let hasNull = false

    // count how many variants have opcodes
    for (const variant of variants) {
        const unwrapped = variant.unwrapAlias()

        if (unwrapped instanceof StructTy) {
            if (unwrapped.anchor?.packPrefix()) {
                nHaveOpcode++
            }
        } else if (unwrapped instanceof NullTy) {
            hasNull = true
        }
    }

    // case 1: All variants have opcodes, just use them
    if (nHaveOpcode === variants.length) {
        for (const variant of variants) {
            const unwrapped = variant.unwrapAlias()
            if (unwrapped instanceof StructTy && unwrapped.anchor?.packPrefix()) {
                try {
                    const prefixNode = unwrapped.anchor.packPrefix()
                    if (prefixNode) {
                        const prefixStr = prefixNode.text
                        const prefix = BigInt(prefixStr)
                        let prefixLen = prefix.toString(2).length

                        if (prefixStr.startsWith("0x")) {
                            prefixLen = (prefixStr.length - 2) * 4
                        } else if (prefixStr.startsWith("0b")) {
                            prefixLen = prefixStr.length - 2
                        }

                        result.push(createPackOpcode(Number(prefix), prefixLen))
                    } else {
                        result.push(createPackOpcode(0, 1))
                    }
                } catch {
                    // Invalid opcode format
                    result.push(createPackOpcode(0, 1))
                }
            }
        }
        return result
    }

    // case 2: Some have opcodes, some don't, this is an error
    if (nHaveOpcode > 0) {
        return undefined
    }

    // case 3: None have opcodes, generate prefix tree
    // Examples: int32 | int64 | int128 / int32 | A | null / A | B / A | B | C
    // If null exists, it's 0, all others are 1+tree: A|B|C|D|null => 0 | 100+A | 101+B | 110+C | 111+D
    // If no null, just distribute sequentially: A|B|C => 00+A | 01+B | 10+C

    const nWithoutNull = variants.length - (hasNull ? 1 : 0)
    const prefixLen = Math.ceil(Math.log2(nWithoutNull))
    let curPrefix = 0

    for (const variant of variants) {
        const unwrapped = variant.unwrapAlias()

        if (unwrapped instanceof NullTy) {
            result.push(createPackOpcode(0, 1))
        } else if (hasNull) {
            result.push(createPackOpcode((1 << prefixLen) + curPrefix++, prefixLen + 1))
        } else {
            result.push(createPackOpcode(curPrefix++, prefixLen))
        }
    }

    return result
}
