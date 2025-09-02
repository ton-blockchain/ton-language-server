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
    Struct,
    TypeAlias,
} from "@server/languages/tolk/psi/Decls"

const IMPLICITLY_USED_FUNCTIONS: Set<string> = new Set([
    "onInternalMessage",
    "onExternalMessage",
    "onBouncedMessage",
    "onRunTickTock",
    "onSplitPrepare",
    "onSplitInstall",
    "main",
])

const IMPLICITLY_USED_METHODS: Set<string> = new Set(["unpackFromSlice", "packToBuilder"])

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
        if (IMPLICITLY_USED_METHODS.has(name)) {
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
}
