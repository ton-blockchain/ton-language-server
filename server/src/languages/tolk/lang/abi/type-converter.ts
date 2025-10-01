import {
    BitsNTy,
    BoolTy,
    BuiltinTy,
    BytesNTy,
    CoinsTy,
    InstantiationTy,
    IntNTy,
    IntTy,
    StructTy,
    Ty,
    TypeAliasTy,
    UnionTy,
    UnknownTy,
    VarIntNTy,
    VoidTy,
} from "@server/languages/tolk/types/ty"
import {BaseTypeInfo, TypeInfo} from "@shared/abi"

/**
 * Convert Tolk type to TypeInfo for ABI generation
 */
export function convertTyToTypeInfo(ty: Ty): TypeInfo {
    if (ty instanceof UnionTy) {
        const asNullable = ty.asNullable()
        if (asNullable) {
            const innerType = convertTyToTypeInfo(asNullable[0])
            return {
                name: "option",
                innerType,
                humanReadable: ty.name(),
            }
        }
        throw new Error(`Unsupported union type: ${ty.name()}`)
    }

    if (ty instanceof TypeAliasTy) {
        const innerType = convertTyToTypeInfo(ty.innerTy)
        return {
            name: "type-alias",
            aliasName: ty.name(),
            innerType,
            humanReadable: ty.name(),
        }
    }

    if (ty instanceof StructTy) {
        return {
            name: "struct",
            structName: ty.name(),
            humanReadable: ty.name(),
        }
    }

    return convertTyToBaseTypeInfo(ty)
}

function convertTyToBaseTypeInfo(ty: Ty): BaseTypeInfo & {humanReadable: string} {
    const humanReadable = ty.name()

    if (ty instanceof IntNTy) {
        const typeName = ty.unsigned ? "uint" : "int"
        return {
            name: typeName,
            width: ty.size,
            humanReadable,
        }
    }

    if (ty instanceof CoinsTy) {
        return {
            name: "coins",
            humanReadable,
        }
    }

    if (ty instanceof VarIntNTy) {
        if (ty.unsigned) {
            if (ty.size === 16) {
                return {
                    name: "varuint16",
                    humanReadable,
                }
            }
            if (ty.size === 32) {
                return {
                    name: "varuint32",
                    humanReadable,
                }
            }
        } else {
            if (ty.size === 16) {
                return {
                    name: "varint16",
                    humanReadable,
                }
            }
            if (ty.size === 32) {
                return {
                    name: "varint32",
                    humanReadable,
                }
            }
        }

        throw new Error(`Unsupported VarIntNTy size: ${ty.size}`)
    }

    if (ty instanceof BoolTy) {
        return {
            name: "bool",
            humanReadable,
        }
    }

    if (ty instanceof VoidTy) {
        return {
            name: "void",
            humanReadable,
        }
    }

    if (ty instanceof IntTy) {
        return {
            name: "int",
            width: 257,
            humanReadable,
        }
    }

    if (ty instanceof BitsNTy) {
        return {
            name: "bits",
            width: ty.size,
            humanReadable,
        }
    }

    if (ty instanceof BytesNTy) {
        return {
            name: "bits",
            width: ty.size * 8,
            humanReadable,
        }
    }

    if (ty instanceof BuiltinTy) {
        switch (ty.name()) {
            case "address": {
                return {name: "address", humanReadable}
            }
            case "cell": {
                return {name: "cell", humanReadable}
            }
            case "slice": {
                return {name: "slice", humanReadable}
            }
        }
    }

    if (ty instanceof InstantiationTy) {
        const innerTypeName = ty.innerTy.name()
        if (innerTypeName === "Cell") {
            const innerType = ty.types.length > 0 ? convertTyToTypeInfo(ty.types[0]) : undefined
            return {
                name: "cell",
                innerType,
                humanReadable,
            }
        }
    }

    if (ty instanceof UnknownTy) {
        return {name: "void", humanReadable}
    }

    throw new Error(`Unsupported type for ABI conversion: ${ty.name()} (${ty.constructor.name})`)
}
