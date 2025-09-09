//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {
    Struct,
    FieldsOwner,
    Field,
    TypeAlias,
    TypeParameter,
    Enum,
    EnumMember,
} from "@server/languages/tolk/psi/Decls"
import {NamedNode} from "@server/languages/tolk/psi/TolkNode"

export interface Ty {
    name(): string

    hasGenerics(): boolean

    substitute(mapping: Map<string, Ty>): Ty

    baseType(): Ty

    equals(other: Ty): boolean

    canRhsBeAssigned(other: Ty): boolean

    unwrapAlias(): Ty

    unwrapOption(): Ty

    unwrapInstantiation(): Ty
}

export abstract class NamedTy<Anchor extends NamedNode> implements Ty {
    public readonly anchor: Anchor | null = null
    protected readonly _name: string

    public constructor(_name: string, anchor: Anchor | null) {
        this.anchor = anchor
        this._name = _name
    }

    public name(): string {
        return this._name
    }

    public hasGenerics(): boolean {
        return false
    }

    public substitute(mapping: Map<string, Ty>): Ty {
        return this
    }

    public baseType(): Ty {
        return baseType(this)
    }

    public equals(other: Ty): boolean {
        if (this === other) return true
        if (other instanceof NamedTy) return this._name === other.name()
        const otherUnwrapped = other.unwrapAlias()
        if (otherUnwrapped instanceof NamedTy) return this._name === otherUnwrapped.name()
        return false
    }

    public canRhsBeAssigned(other: Ty): boolean {
        if (this === other) return true
        if (other instanceof TypeAliasTy) return this.canRhsBeAssigned(other.innerTy)
        if (other instanceof TypeParameterTy) return true
        if (other instanceof NamedTy) return this._name === other.name()
        if (this.equals(other)) return true
        return other instanceof NeverTy || other instanceof UnknownTy
    }

    public unwrapAlias(): Ty {
        return unwrapAlias(this)
    }

    public unwrapOption(): Ty {
        return unwrapOption(this)
    }

    public unwrapInstantiation(): Ty {
        return unwrapInstantiation(this)
    }
}

export abstract class NonNamedTy implements Ty {
    public abstract name(): string

    public hasGenerics(): boolean {
        return false
    }

    public substitute(mapping: Map<string, Ty>): Ty {
        return this
    }

    public baseType(): Ty {
        return baseType(this)
    }

    public equals(other: Ty): boolean {
        const otherUnwrapped = other.unwrapAlias()
        return this === otherUnwrapped
    }

    public canRhsBeAssigned(other: Ty): boolean {
        if (this === other) return true
        if (other instanceof TypeAliasTy) return this.canRhsBeAssigned(other.innerTy)
        if (this.equals(other)) return true
        return other instanceof NeverTy || other instanceof UnknownTy
    }

    public unwrapAlias(): Ty {
        return this
    }

    public unwrapOption(): Ty {
        return unwrapOption(this)
    }

    public unwrapInstantiation(): Ty {
        return unwrapInstantiation(this)
    }
}

export class FieldsOwnerTy<Anchor extends FieldsOwner> extends NamedTy<Anchor> {
    public constructor(
        public fieldsTy: Ty[],
        _name: string,
        anchor: Anchor | null,
    ) {
        super(_name, anchor)
    }

    public fields(): Field[] {
        if (this.anchor === null) return []
        return this.anchor.fields()
    }
}

export class StructTy extends FieldsOwnerTy<Struct> {
    public override substitute(mapping: Map<string, Ty>): Ty {
        return new StructTy(
            this.fieldsTy.map(it => it.substitute(mapping)),
            this.name(),
            this.anchor,
        )
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (this === other) return true
        if (other instanceof TypeAliasTy) return this.canRhsBeAssigned(other.innerTy)
        if (other instanceof NeverTy) return true
        return this._name === other.name()
    }
}

export class EnumTy extends NamedTy<Enum> {
    public members(): EnumMember[] {
        if (this.anchor === null) return []
        return this.anchor.members()
    }

    public override substitute(_mapping: Map<string, Ty>): Ty {
        return new EnumTy(this.name(), this.anchor)
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (this === other) return true
        if (other instanceof TypeAliasTy) return this.canRhsBeAssigned(other.innerTy)
        if (other instanceof NeverTy) return true
        return this._name === other.name()
    }
}

export class TypeAliasTy extends NamedTy<TypeAlias> {
    public constructor(
        name: string,
        anchor: TypeAlias | null,
        public innerTy: Ty,
    ) {
        super(name, anchor)
    }

    public override equals(other: Ty): boolean {
        if (this === other) return true
        if (!(other instanceof TypeAliasTy)) return false
        return this._name === other._name && this.innerTy.equals(other.innerTy)
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (this._name === other.name()) return true
        return this.innerTy.canRhsBeAssigned(other)
    }

    public override hasGenerics(): boolean {
        return this.innerTy.hasGenerics()
    }

    public override substitute(mapping: Map<string, Ty>): Ty {
        return new TypeAliasTy(this._name, this.anchor, this.innerTy.substitute(mapping))
    }
}

export class TensorTy extends NonNamedTy {
    public constructor(public elements: Ty[]) {
        super()
    }

    public name(): string {
        return `(${this.elements.map(it => it.name()).join(", ")})`
    }

    public override equals(other: Ty): boolean {
        if (this === other) return true
        if (!(other instanceof TensorTy)) return false
        if (this.elements.length !== other.elements.length) return false
        return this.elements.every((element, i) => element.equals(other.elements[i]))
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (this === other) return true
        if (other instanceof TypeAliasTy) return this.canRhsBeAssigned(other.innerTy)
        if (!(other instanceof TensorTy)) return other instanceof NeverTy
        if (this.elements.length !== other.elements.length) return false
        for (let i = 0; i < other.elements.length; i++) {
            const left = this.elements[i]
            const right = other.elements[i]

            if (!left.canRhsBeAssigned(right)) {
                return false
            }
        }
        return true
    }

    public override hasGenerics(): boolean {
        return this.elements.some(it => it.hasGenerics())
    }

    public override substitute(mapping: Map<string, Ty>): Ty {
        return new TensorTy(this.elements.map(it => it.substitute(mapping)))
    }
}

export class TupleTy extends NonNamedTy {
    public constructor(public elements: Ty[]) {
        super()
    }

    public name(): string {
        return `[${this.elements.map(it => it.name()).join(", ")}]`
    }

    public override equals(other: Ty): boolean {
        if (this === other) return true
        if (!(other instanceof TupleTy)) return false
        if (this.elements.length !== other.elements.length) return false
        return this.elements.every((element, i) => element.equals(other.elements[i]))
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (this === other) return true
        if (other instanceof TypeAliasTy) return this.canRhsBeAssigned(other.innerTy)
        if (!(other instanceof TupleTy)) return other instanceof NeverTy
        if (this.elements.length !== other.elements.length) return false
        for (let i = 0; i < other.elements.length; i++) {
            const left = this.elements[i]
            const right = other.elements[i]

            if (!left.canRhsBeAssigned(right)) {
                return false
            }
        }
        return true
    }

    public override hasGenerics(): boolean {
        return this.elements.some(it => it.hasGenerics())
    }

    public override substitute(mapping: Map<string, Ty>): Ty {
        return new TupleTy(this.elements.map(it => it.substitute(mapping)))
    }
}

export class UnionTy extends NonNamedTy {
    public constructor(public elements: Ty[]) {
        super()
    }

    public static create(types: Ty[]): Ty {
        const variants: Ty[] = []

        for (const type of types) {
            const unwrappedType = type.baseType()
            if (unwrappedType instanceof UnionTy) {
                for (const otherType of unwrappedType.elements) {
                    this.addUnique(variants, otherType)
                }
            } else {
                this.addUnique(variants, type)
            }
        }

        if (variants.length === 1) {
            return variants[0]
        }

        return new UnionTy(variants)
    }

    private static addUnique(to: Ty[], type: Ty): void {
        const unwrappedType = type.unwrapAlias()
        if (to.some(it => it.unwrapAlias().equals(unwrappedType))) {
            return // already exists
        }
        to.push(type)
    }

    public name(): string {
        const asNullable = this.asNullable()
        if (asNullable) {
            return asNullable[0].name() + "?"
        }

        return this.elements.map(it => it.name()).join(" | ")
    }

    public override equals(other: Ty): boolean {
        if (this === other) return true
        if (!(other instanceof UnionTy)) return false
        if (this.elements.length !== other.elements.length) return false

        return (
            this.elements.every(element =>
                other.elements.some(otherElement => element.equals(otherElement)),
            ) &&
            other.elements.every(element =>
                this.elements.some(thisElement => element.equals(thisElement)),
            )
        )
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (this === other) return true
        if (this.calculateExactVariantToFitRhs(other) !== null) return true
        if (other instanceof UnionTy) return this.containsAll(other)
        if (other instanceof TypeAliasTy) return this.canRhsBeAssigned(other.innerTy)
        return other instanceof NeverTy
    }

    public contains(other: Ty): boolean {
        return this.elements.some(it => it.equals(other))
    }

    public containsAll(other: UnionTy): boolean {
        for (const element of other.elements) {
            if (!this.contains(element)) {
                return false
            }
        }
        return true
    }

    public asNullable(): [Ty, Ty] | undefined {
        if (this.elements.length !== 2) return undefined
        const left = this.elements[0]
        const right = this.elements[1]
        if (left instanceof NullTy) return [right, left]
        if (right instanceof NullTy) return [left, right]
        return undefined
    }

    public calculateExactVariantToFitRhs(rhsType: Ty): Ty | null {
        const rightBase = rhsType.baseType()
        const rightUnion = rightBase instanceof UnionTy ? rightBase : undefined
        //  primitive 1-slot nullable don't store type_id, they can be assigned less strict, like `int?` to `int16?`
        if (rightUnion) {
            const leftNullable = this.asNullable()
            const rightNullable = this.asNullable()
            if (
                leftNullable &&
                rightNullable &&
                leftNullable[0].baseType().equals(rightNullable[0].baseType())
            ) {
                return this
            }
            return null
        }

        // `int` to `int | int8` is okay: exact type matching
        for (const element of this.elements) {
            if (element.baseType().equals(rightBase)) {
                return element
            }
        }

        // find the only T_i; it would also be used for transition at IR generation, like `(int,null)` to `(int, User?) | int`
        let firstCovering: Ty | null = null
        for (const variant of this.elements) {
            if (variant.canRhsBeAssigned(rhsType)) {
                if (firstCovering != null) {
                    return null
                }
                firstCovering = variant
            }
        }
        return firstCovering
    }

    public override hasGenerics(): boolean {
        return this.elements.some(it => it.hasGenerics())
    }

    public override substitute(mapping: Map<string, Ty>): Ty {
        return UnionTy.create(this.elements.map(it => it.substitute(mapping)))
    }
}

export class FuncTy extends NonNamedTy {
    public constructor(
        public params: Ty[],
        public returnTy: Ty,
    ) {
        super()
    }

    public name(): string {
        const params = this.params.map(it => it.name()).join(", ")
        return `(${params}) -> ${this.returnTy.name()}`
    }

    public override equals(other: Ty): boolean {
        if (this === other) return true
        if (!(other instanceof FuncTy)) return false
        if (this.params.length !== other.params.length) return false

        return (
            this.params.every((param, i) => param.equals(other.params[i])) &&
            this.returnTy.equals(other.returnTy)
        )
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (this === other) return true
        if (other instanceof TypeAliasTy) return this.canRhsBeAssigned(other.innerTy)
        if (!(other instanceof FuncTy)) return other instanceof NeverTy
        if (this.params.length !== other.params.length) return false

        for (let i = 0; i < other.params.length; i++) {
            const left = this.params[i]
            const right = other.params[i]

            if (!left.canRhsBeAssigned(right)) {
                return false
            }
            if (!right.canRhsBeAssigned(left)) {
                return false
            }
        }
        return (
            this.returnTy.canRhsBeAssigned(other.returnTy) &&
            other.returnTy.canRhsBeAssigned(this.returnTy)
        )
    }

    public override hasGenerics(): boolean {
        return this.params.some(it => it.hasGenerics()) || this.returnTy.hasGenerics()
    }

    public override substitute(mapping: Map<string, Ty>): Ty {
        return new FuncTy(
            this.params.map(it => it.substitute(mapping)),
            this.returnTy.substitute(mapping),
        )
    }
}

export class TypeParameterTy extends NamedTy<TypeParameter> {
    public constructor(
        param: TypeParameter,
        public defaultType: Ty | null = null,
    ) {
        super(param.name(), param)
    }

    public override hasGenerics(): boolean {
        return true
    }

    public override substitute(mapping: Map<string, Ty>): Ty {
        const ty = mapping.get(this.name())
        if (ty) {
            return ty
        }
        return this
    }
}

export class InstantiationTy extends NonNamedTy {
    public constructor(
        public innerTy: Ty,
        public types: Ty[],
    ) {
        super()
    }

    public name(): string {
        const types = this.types.map(it => it.name()).join(", ")
        return `${this.innerTy.name()}<${types}>`
    }

    public override equals(other: Ty): boolean {
        if (this === other) return true
        if (!(other instanceof InstantiationTy)) return false
        if (this.types.length !== other.types.length) return false

        return (
            this.innerTy.equals(other.innerTy) &&
            this.types.every((type, i) => type.equals(other.types[i]))
        )
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (this === other) return true
        if (other instanceof TypeAliasTy) return this.canRhsBeAssigned(other.innerTy)

        if (this.innerTy.unwrapAlias() instanceof UnionTy) {
            return this.innerTy.unwrapAlias().canRhsBeAssigned(other)
        }

        if (!(other instanceof InstantiationTy)) return other instanceof NeverTy

        if (!this.innerTy.canRhsBeAssigned(other.innerTy)) {
            return false
        }

        if (this.types.length !== other.types.length) return false
        for (let i = 0; i < other.types.length; i++) {
            const left = this.types[i]
            const right = other.types[i]

            if (!left.canRhsBeAssigned(right)) {
                return false
            }
        }

        return true
    }

    public override hasGenerics(): boolean {
        return this.types.some(it => it.hasGenerics())
    }

    public override unwrapAlias(): Ty {
        if (this.innerTy instanceof TypeAliasTy) {
            const inner = this.innerTy.innerTy
            if (inner instanceof UnionTy) {
                return inner
            }
            return new InstantiationTy(unwrapAlias(inner), this.types)
        }
        return super.unwrapAlias()
    }

    public override substitute(mapping: Map<string, Ty>): Ty {
        return new InstantiationTy(
            this.innerTy.substitute(mapping),
            this.types.map(it => it.substitute(mapping)),
        )
    }
}

export class BuiltinTy extends NamedTy<TypeAlias> {
    public override canRhsBeAssigned(other: Ty): boolean {
        // Can assign Cell<T> to cell
        if (this._name === "cell" && other.baseType().name() === "Cell") return true
        return super.canRhsBeAssigned(other)
    }
}

export class IntTy extends NonNamedTy {
    public name(): string {
        return "int"
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (other instanceof IntTy) return true
        return super.canRhsBeAssigned(other)
    }

    public static INT: IntTy = new IntTy()
}

export class IntNTy extends IntTy {
    public constructor(
        public size: number,
        public unsigned: boolean,
    ) {
        super()
    }

    public override name(): string {
        return this.unsigned ? `uint${this.size}` : `int${this.size}`
    }

    public override equals(other: Ty): boolean {
        if (!(other instanceof IntNTy)) return false
        if (this.size === other.size && this.unsigned === other.unsigned) return true
        return super.equals(other)
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (other instanceof IntNTy) return this.size === other.size
        return super.canRhsBeAssigned(other)
    }
}

export class VarIntNTy extends IntTy {
    public constructor(
        public size: number,
        public unsigned: boolean,
    ) {
        super()
    }

    public override name(): string {
        return this.unsigned ? `varuint${this.size}` : `varint${this.size}`
    }

    public override equals(other: Ty): boolean {
        if (!(other instanceof VarIntNTy)) return false
        if (this.size === other.size && this.unsigned === other.unsigned) return true
        return super.equals(other)
    }
}

export class CoinsTy extends IntTy {
    public override name(): string {
        return "coins"
    }

    public static COINS: CoinsTy = new CoinsTy()
}

export class BoolTy extends NonNamedTy {
    private constructor(public value: boolean | undefined) {
        super()
    }

    public name(): string {
        return "bool"
    }

    public negate(): BoolTy {
        if (this.value === undefined) return this
        if (this.value) return BoolTy.FALSE
        return BoolTy.TRUE
    }

    public override equals(other: Ty): boolean {
        if (other instanceof BoolTy) {
            return this.value === other.value
        }
        return false
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (other instanceof BoolTy) return true
        return super.canRhsBeAssigned(other)
    }

    public static BOOL: BoolTy = new BoolTy(undefined)
    public static TRUE: BoolTy = new BoolTy(true)
    public static FALSE: BoolTy = new BoolTy(false)
}

export class BitsNTy extends NonNamedTy {
    public constructor(public size: number) {
        super()
    }

    public override name(): string {
        return `bits${this.size}`
    }

    public override equals(other: Ty): boolean {
        if (!(other instanceof BitsNTy)) return false
        if (this.size === other.size) return true
        return super.equals(other)
    }
}

export class BytesNTy extends NonNamedTy {
    public constructor(public size: number) {
        super()
    }

    public override name(): string {
        return `bytes${this.size}`
    }

    public override equals(other: Ty): boolean {
        if (!(other instanceof BytesNTy)) return false
        if (this.size === other.size) return true
        return super.equals(other)
    }
}

export class NullTy extends NonNamedTy {
    public name(): string {
        return "null"
    }

    public override equals(other: Ty): boolean {
        return other instanceof NullTy
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (other instanceof NullTy) return true
        return super.canRhsBeAssigned(other)
    }

    public static NULL: NullTy = new NullTy()
}

export class VoidTy extends NonNamedTy {
    public name(): string {
        return "void"
    }

    public override equals(other: Ty): boolean {
        return other instanceof VoidTy
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (other instanceof VoidTy) return true
        return super.canRhsBeAssigned(other)
    }

    public static VOID: VoidTy = new VoidTy()
}

export class UnknownTy extends NonNamedTy {
    public name(): string {
        return "unknown"
    }

    public override equals(other: Ty): boolean {
        return other instanceof UnknownTy
    }

    public override canRhsBeAssigned(_other: Ty): boolean {
        return true // unknown type can accept anything
    }

    public static UNKNOWN: UnknownTy = new UnknownTy()
}

export class NeverTy extends NonNamedTy {
    public name(): string {
        return "never"
    }

    public override equals(other: Ty): boolean {
        return other instanceof NeverTy
    }

    public override canRhsBeAssigned(other: Ty): boolean {
        if (this === other) return true
        if (other instanceof TypeAliasTy) return this.canRhsBeAssigned(other.innerTy)
        return other instanceof NeverTy
    }

    public static NEVER: NeverTy = new NeverTy()
}

export function baseType(ty: Ty): Ty {
    if (ty instanceof TypeAliasTy) {
        return baseType(ty.innerTy)
    }
    if (ty instanceof InstantiationTy) {
        return baseType(ty.innerTy)
    }
    if (ty instanceof UnionTy) {
        return ty
    }
    return ty
}

export function unwrapAlias(ty: Ty): Ty {
    if (ty instanceof TypeAliasTy) {
        return unwrapAlias(ty.innerTy)
    }
    return ty
}

export function unwrapInstantiation(ty: Ty): Ty {
    if (ty instanceof InstantiationTy) {
        return unwrapInstantiation(ty.innerTy)
    }
    return ty
}

export function unwrapOption(ty: Ty): Ty {
    if (ty instanceof UnionTy) {
        const asNullable = ty.asNullable()
        if (!asNullable) return ty
        return asNullable[0]
    }
    return ty
}

export function joinTypes(left: Ty, right: Ty): Ty {
    if (left.equals(right)) return left
    if (right instanceof UnknownTy) return UnknownTy.UNKNOWN
    if (right instanceof NeverTy) return left
    if (right instanceof NullTy) return UnionTy.create([left, right])

    if (left instanceof BoolTy && left.value && right instanceof BoolTy && right.value) {
        return BoolTy.TRUE // true & true => true
    }
    if (left instanceof BoolTy && !left.value && right instanceof BoolTy && !right.value) {
        return BoolTy.FALSE // false & false => false
    }
    if (left instanceof BoolTy && right instanceof BoolTy) {
        return BoolTy.BOOL // true & false => bool
    }

    if (
        left instanceof TensorTy &&
        right instanceof TensorTy &&
        left.elements.length === right.elements.length
    ) {
        const types: Ty[] = []

        for (let i = 0; i < left.elements.length; i++) {
            const leftTy = left.elements[i]
            const rightTy = right.elements[i]
            types.push(joinTypes(leftTy, rightTy))
        }

        return new TensorTy(types)
    }

    if (
        left instanceof TupleTy &&
        right instanceof TupleTy &&
        left.elements.length === right.elements.length
    ) {
        const types: Ty[] = []

        for (let i = 0; i < left.elements.length; i++) {
            const leftTy = left.elements[i]
            const rightTy = right.elements[i]
            types.push(joinTypes(leftTy, rightTy))
        }

        return new TupleTy(types)
    }

    if (left instanceof TypeAliasTy) return joinTypes(left.innerTy, right)
    if (right instanceof TypeAliasTy) return joinTypes(left, right.innerTy)

    return UnionTy.create([left, right])
}

// return `T`, so that `T + subtract_type` = type
// example: `int?` - `null` = `int`
// example: `int | slice | builder | bool` - `bool | slice` = `int | builder`
// what for: `if (x != null)` / `if (x is T)`, to smart cast x inside if
export function subtractTypes(left: Ty | null, right: Ty): Ty {
    if (!left) return NeverTy.NEVER
    if (!(left instanceof UnionTy)) return left

    const restVariants: Ty[] = []
    if (right instanceof UnionTy) {
        if (left.containsAll(right)) {
            for (const leftVariant of left.elements) {
                if (!right.contains(leftVariant)) {
                    restVariants.push(leftVariant)
                }
            }
        }
    } else if (left.contains(right)) {
        for (const leftVariant of left.elements) {
            if (!leftVariant.equals(right)) {
                restVariants.push(leftVariant)
            }
        }
    }

    if (restVariants.length === 0) {
        return NeverTy.NEVER
    }

    if (restVariants.length === 1) {
        return restVariants[0]
    }

    return UnionTy.create(restVariants)
}
