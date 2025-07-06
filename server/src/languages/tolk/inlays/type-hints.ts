//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"
import * as lsp from "vscode-languageserver"
import {BuiltinTy, FuncTy, StructTy, Ty, TypeAliasTy} from "@server/languages/tolk/types/ty"
import {InlayHintLabelPart} from "vscode-languageserver"
import {toLocation} from "@server/languages/tolk/inlays/common"
import {CallLike, Expression, VarDeclaration} from "@server/languages/tolk/psi/TolkNode"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {TypeInferer} from "@server/languages/tolk/TypeInferer"
import {FileDiff} from "@server/utils/FileDiff"
import {InlayHintKind} from "vscode-languageserver-types"
import {Constant, FunctionBase} from "@server/languages/tolk/psi/Decls"
import {typeOf} from "@server/languages/tolk/type-inference"

export function variableDeclarationTypeHint(
    n: SyntaxNode,
    file: TolkFile,
    result: lsp.InlayHint[],
): void {
    const decl = new VarDeclaration(n, file)
    if (decl.hasTypeHint() || decl.isRedef()) return // already have typehint

    const name = decl.nameIdentifier()
    if (!name) return
    if (name.text === "_") return

    const expr = decl.value()
    if (!expr) return

    if (hasObviousType(expr)) return

    const type = typeOf(n, file)
    if (!type) return

    const position = {
        line: name.endPosition.row,
        character: name.endPosition.column,
    }
    const hintText = `: ${type.name()}`

    const diff = FileDiff.forFile(file.uri)
    diff.appendTo(position, hintText)

    result.push({
        kind: InlayHintKind.Type,
        label: typeHintParts(type),
        position: position,
        textEdits: diff.toTextEdits(),
    })
}

export function catchVariableTypeHint(
    node: SyntaxNode,
    type: Ty | null,
    file: TolkFile,
    result: lsp.InlayHint[],
): void {
    if (!type) return

    const position = {
        line: node.endPosition.row,
        character: node.endPosition.column,
    }
    const hintText = `: ${type.name()}`

    const diff = FileDiff.forFile(file.uri)
    diff.appendTo(position, hintText)

    result.push({
        kind: InlayHintKind.Type,
        label: typeHintParts(type),
        position: position,
        textEdits: diff.toTextEdits(),
    })
}

export function constantDeclarationTypeHint(
    n: SyntaxNode,
    file: TolkFile,
    result: lsp.InlayHint[],
): void {
    const decl = new Constant(n, file)
    if (decl.hasTypeHint()) return // already have typehint

    const name = decl.nameIdentifier()
    if (!name) return
    if (name.text === "_") return

    const expr = decl.value()
    if (!expr) return

    if (hasObviousType(expr)) return

    const type = TypeInferer.inferType(expr)
    if (!type) return

    const position = {
        line: name.endPosition.row,
        character: name.endPosition.column,
    }
    const hintText = `: ${type.name()}`

    const diff = FileDiff.forFile(file.uri)
    diff.appendTo(position, hintText)

    result.push({
        kind: InlayHintKind.Type,
        label: typeHintParts(type),
        position: position,
        textEdits: diff.toTextEdits(),
    })
}

export function functionReturnTypeHint(func: FunctionBase, result: lsp.InlayHint[]): void {
    const closeParen = func.closeParameterListParen()
    if (!closeParen) return

    const functionType = typeOf(func.node, func.file)
    if (!(functionType instanceof FuncTy)) return

    const inferredReturnType = functionType.returnTy

    const position = {
        line: closeParen.endPosition.row,
        character: closeParen.endPosition.column,
    }
    const hintText = `: ${inferredReturnType.name()}`

    const diff = FileDiff.forFile(func.file.uri)
    diff.appendTo(position, hintText)

    result.push({
        kind: InlayHintKind.Type,
        label: typeHintParts(inferredReturnType),
        position: position,
        textEdits: diff.toTextEdits(),
    })
}

function hasObviousType(expr: Expression): boolean {
    // don't show a hint for:
    // val params = SomeParams{}
    if (expr.node.type === "object_literal") return true

    // don't show a hint for:
    // val foo = Foo.fromCell(cell)
    if (expr.node.type === "function_call") {
        const calleeName = new CallLike(expr.node, expr.file).calleeName()
        if (calleeName?.text === "fromCell" || calleeName?.text === "fromSlice") {
            return true
        }
    }

    // don't show a hint for:
    // val params = lazy SomeParams.fromCell()
    if (expr.node.type === "lazy_expression") {
        const inner = expr.node.childForFieldName("argument")
        if (!inner) return false
        return hasObviousType(new Expression(inner, expr.file))
    }

    return false
}

function typeHintParts(ty: Ty): InlayHintLabelPart[] {
    return [
        {
            value: ": ",
        },
        ...renderTypeToParts(ty),
    ]
}

function renderTypeToParts(ty: Ty): InlayHintLabelPart[] {
    if (ty instanceof BuiltinTy) {
        return [
            {
                value: ty.name(),
                tooltip: "",
                location: toLocation(ty.anchor?.nameNode()),
            },
        ]
    }

    if (ty instanceof StructTy || ty instanceof TypeAliasTy) {
        return [
            {
                value: ty.name(),
                location: toLocation(ty.anchor?.nameNode()),
                tooltip: "",
            },
        ]
    }

    return [
        {
            value: ty.name(),
            tooltip: "",
        },
    ]
}
