//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
export interface Ty {
    name(): string

    equals(other: Ty): boolean
}

export abstract class NonNamedTy implements Ty {
    public abstract name(): string

    public equals(other: Ty): boolean {
        return this === other
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
}

export class PrimitiveTy extends NonNamedTy {
    public constructor(private readonly name_: string) {
        super()
    }

    public name(): string {
        return this.name_
    }

    public static INT: PrimitiveTy = new PrimitiveTy("int")
    public static CELL: PrimitiveTy = new PrimitiveTy("cell")
    public static SLICE: PrimitiveTy = new PrimitiveTy("slice")
    public static BUILDER: PrimitiveTy = new PrimitiveTy("builder")
    public static CONT: PrimitiveTy = new PrimitiveTy("cont")
    public static TUPLE: PrimitiveTy = new PrimitiveTy("tuple")
}

export class VarTy extends NonNamedTy {
    public name(): string {
        return "var"
    }

    public override equals(other: Ty): boolean {
        return other instanceof VarTy
    }

    public static VAR: VarTy = new VarTy()
}

export class HoleTy extends NonNamedTy {
    public name(): string {
        return "_"
    }

    public override equals(other: Ty): boolean {
        return other instanceof HoleTy
    }

    public static HOLE: HoleTy = new HoleTy()
}

export class UnknownTy extends NonNamedTy {
    public name(): string {
        return "unknown"
    }

    public override equals(other: Ty): boolean {
        return other instanceof UnknownTy
    }

    public static UNKNOWN: UnknownTy = new UnknownTy()
}
