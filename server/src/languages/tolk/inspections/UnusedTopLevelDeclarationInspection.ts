//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type * as lsp from "vscode-languageserver"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {UnusedInspection} from "./UnusedInspection"
import {Inspection, InspectionIds} from "./Inspection"
import {
    Constant,
    Enum,
    Func,
    GlobalVariable,
    InstanceMethod,
    MethodBase,
    StaticMethod,
    Struct,
    TypeAlias,
} from "@server/languages/tolk/psi/Decls"
import {inferenceOf} from "@server/languages/tolk/type-inference"
import {FuncTy, TypeAliasTy} from "@server/languages/tolk/types/ty"

const IMPLICITLY_USED_FUNCTIONS: Set<string> = new Set([
    "onInternalMessage",
    "onExternalMessage",
    "onBouncedMessage",
    "onRunTickTock",
    "onSplitPrepare",
    "onSplitInstall",
    "main",
])

export class UnusedTopLevelDeclarationInspection extends UnusedInspection implements Inspection {
    public readonly id: "unused-top-level-declaration" = InspectionIds.UNUSED_TOP_LEVEL_DECLARATION

    protected checkFile(file: TolkFile, diagnostics: lsp.Diagnostic[]): void {
        for (const fun of file.getFunctions()) {
            this.inspectFunction(fun, diagnostics)
        }
        for (const method of file.getMethods()) {
            this.inspectMethod(method, diagnostics)
        }
        for (const constant of file.getConstants()) {
            this.inspectConstant(constant, diagnostics)
        }
        for (const global of file.getGlobalVariables()) {
            this.inspectGlobalVariable(global, diagnostics)
        }
        for (const alias of file.getTypeAliases()) {
            this.inspectTypeAlias(alias, diagnostics)
        }
        for (const struct of file.getStructs()) {
            this.inspectStruct(struct, diagnostics)
        }
        for (const enum_ of file.getEnums()) {
            this.inspectEnum(enum_, diagnostics)
        }
    }

    private inspectFunction(fun: Func, diagnostics: lsp.Diagnostic[]): void {
        const name = fun.name()
        if (IMPLICITLY_USED_FUNCTIONS.has(name)) {
            return
        }

        if (fun.getExplicitMethodId !== null) {
            // allow
            // @method_id(10)
            // fun testSome() {}
            return
        }

        this.checkUnused(fun.nameIdentifier(), fun.file, diagnostics, {
            kind: "Function",
            code: "unused-function",
            rangeNode: fun.nameIdentifier(),
        })
    }

    private inspectMethod(fun: Func, diagnostics: lsp.Diagnostic[]): void {
        const name = fun.name()
        if (this.isUnpackFromSlice(fun) || this.isPackToBuilder(fun)) {
            return
        }

        const isSpecialMethod = name === "packToBuilder" || name === "unpackFromSlice"
        if (isSpecialMethod) {
            if (this.isMethodOfAlias(fun)) {
                const expectedSignature =
                    name === "packToBuilder" ? "self, mutate b: builder" : "mutate s: slice"

                this.checkUnused(fun.nameIdentifier(), fun.file, diagnostics, {
                    kind: "Method",
                    code: "unused-method",
                    additionalText: `, if you want custom serialization/deserialization logic, check signature of \`${name}\` method, it should be like: \`fun Type.${name}(${expectedSignature})\``,
                    rangeNode: fun.nameIdentifier(),
                })
            } else {
                this.checkUnused(fun.nameIdentifier(), fun.file, diagnostics, {
                    kind: "Method",
                    code: "unused-method",
                    additionalText: `, note, special \`${name}\` method can be used only for type aliases to change serialization/deserialization logic`,
                    rangeNode: fun.nameIdentifier(),
                })
            }
            return
        }

        this.checkUnused(fun.nameIdentifier(), fun.file, diagnostics, {
            kind: "Method",
            code: "unused-method",
            rangeNode: fun.nameIdentifier(),
        })
    }

    private inspectConstant(constant: Constant, diagnostics: lsp.Diagnostic[]): void {
        this.checkUnused(constant.nameIdentifier(), constant.file, diagnostics, {
            kind: "Constant",
            code: "unused-constant",
            rangeNode: constant.nameIdentifier(),
        })
    }

    private inspectGlobalVariable(global: GlobalVariable, diagnostics: lsp.Diagnostic[]): void {
        this.checkUnused(global.nameIdentifier(), global.file, diagnostics, {
            kind: "Global variable",
            code: "unused-global",
            rangeNode: global.nameIdentifier(),
        })
    }

    private inspectTypeAlias(alias: TypeAlias, diagnostics: lsp.Diagnostic[]): void {
        this.checkUnused(alias.nameIdentifier(), alias.file, diagnostics, {
            kind: "Type alias",
            code: "unused-type-alias",
            rangeNode: alias.nameIdentifier(),
        })
    }

    private inspectStruct(struct: Struct, diagnostics: lsp.Diagnostic[]): void {
        this.checkUnused(struct.nameIdentifier(), struct.file, diagnostics, {
            kind: "Struct",
            code: "unused-struct",
            rangeNode: struct.nameIdentifier(),
        })

        for (const field of struct.fields()) {
            this.checkUnused(field.nameIdentifier(), struct.file, diagnostics, {
                kind: "Field",
                code: "unused-field",
                rangeNode: field.node,
            })
        }
    }

    private inspectEnum(enum_: Enum, diagnostics: lsp.Diagnostic[]): void {
        this.checkUnused(enum_.nameIdentifier(), enum_.file, diagnostics, {
            kind: "Enum",
            code: "unused-enum",
            rangeNode: enum_.nameIdentifier(),
        })

        for (const member of enum_.members()) {
            this.checkUnused(member.nameIdentifier(), enum_.file, diagnostics, {
                kind: "Enum member",
                code: "unused-enum-member",
                rangeNode: member.node,
            })
        }
    }

    private isMethodOfAlias(fun: Func): boolean {
        if (!(fun instanceof MethodBase)) return false

        const inference = inferenceOf(fun.node, fun.file)
        if (!inference) return false

        const receiverTy = inference.typeOf(fun.receiverTypeNode())
        if (!receiverTy) return false

        return receiverTy instanceof TypeAliasTy
    }

    private isUnpackFromSlice(fun: Func): boolean {
        return this.isMethod(fun, "unpackFromSlice", true, "slice")
    }

    private isPackToBuilder(fun: Func): boolean {
        return this.isMethod(fun, "packToBuilder", false, "builder")
    }

    private isMethod(fun: Func, name: string, isStatic: boolean, expectedParams: string): boolean {
        const hasName = fun.name() === name
        if (!hasName) return false

        if (!(fun instanceof MethodBase)) return false
        if (isStatic && fun instanceof InstanceMethod) return false
        if (!isStatic && fun instanceof StaticMethod) return false

        const inference = inferenceOf(fun.node, fun.file)
        if (!inference) return hasName

        const actualFuncTy = inference.typeOf(fun.node)
        if (!actualFuncTy || !(actualFuncTy instanceof FuncTy)) return hasName

        const receiverTy = inference.typeOf(fun.receiverTypeNode())
        if (!receiverTy) return false

        const params =
            fun instanceof InstanceMethod ? actualFuncTy.params.slice(1) : actualFuncTy.params

        return (
            receiverTy instanceof TypeAliasTy &&
            params.map(it => it.name()).join(", ") === expectedParams
        )
    }
}
