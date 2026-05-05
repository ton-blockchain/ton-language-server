import type {TypeParameter} from "@server/languages/tolk/psi/Decls"

import {
    ArrayTy,
    BoolTy,
    FuncTy,
    InstantiationTy,
    IntTy,
    StructTy,
    TypeAliasTy,
    TypeParameterTy,
    UnionTy,
} from "./ty"

function typeParameter(name: string): TypeParameter {
    return {name: () => name} as unknown as TypeParameter
}

describe("Ty substitution", () => {
    it("keeps composite types unchanged for empty and irrelevant mappings", () => {
        const union = UnionTy.create([IntTy.INT, BoolTy.BOOL])
        const func = new FuncTy([union], new ArrayTy(IntTy.INT))
        const alias = new TypeAliasTy("Alias", null, IntTy.INT)

        expect(union.substitute(new Map())).toBe(union)
        expect(func.substitute(new Map())).toBe(func)
        expect(alias.substitute(new Map([["T", BoolTy.BOOL]]))).toBe(alias)
    })

    it("substitutes generic struct fields inside instantiations", () => {
        const generic = new TypeParameterTy(typeParameter("T"))
        const struct = new StructTy([generic], "Box", null)
        const instantiated = new InstantiationTy(struct, [IntTy.INT])

        expect(struct.hasGenerics()).toBe(true)

        const substituted = instantiated.substitute(new Map([["T", IntTy.INT]]))

        expect(substituted).not.toBe(instantiated)
        expect(substituted).toBeInstanceOf(InstantiationTy)

        const innerTy = (substituted as InstantiationTy).innerTy
        expect(innerTy).toBeInstanceOf(StructTy)
        expect((innerTy as StructTy).fieldsTy[0]).toBe(IntTy.INT)
    })
})
