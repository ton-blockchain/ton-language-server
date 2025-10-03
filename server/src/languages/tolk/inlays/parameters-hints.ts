//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"
import {InlayHint, InlayHintKind} from "vscode-languageserver-types"

import {CallLike, NamedNode} from "@server/languages/tolk/psi/TolkNode"
import type {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {Reference} from "@server/languages/tolk/psi/Reference"
import {FunctionBase, InstanceMethod} from "@server/languages/tolk/psi/Decls"
import {toLocation} from "@server/languages/tolk/inlays/common"

export function parametersHints(n: SyntaxNode, file: TolkFile, result: InlayHint[]): void {
    const call = new CallLike(n, file)
    const callee = call.callee()
    const calleeName = call.calleeName()
    if (!calleeName || !callee) return

    const args = call.arguments()
    if (args.length === 0) return // no arguments, no need to resolve anything

    const resolved = Reference.resolve(new NamedNode(calleeName, file))
    if (!(resolved instanceof FunctionBase)) return

    const skipSelf = resolved instanceof InstanceMethod && callee.type === "dot_access"
    const params = resolved.parameters(skipSelf)

    processParameters(resolved, params, args, result)
}

function processParameters(
    func: FunctionBase,
    params: NamedNode[],
    args: SyntaxNode[],
    result: InlayHint[],
): void {
    if (params.length === 0) return

    const funcName = func.name()
    if (funcName === "ton") {
        // too verbose and too obvious
        return
    }

    for (let i = 0; i < Math.min(params.length, args.length); i++) {
        const param = params[i]
        const arg = args[i]
        const paramName = param.name()

        if (paramName.length === 1) {
            // don't show hints for single letter parameters
            continue
        }
        if (paramName === "constString") {
            // not very useful information
            continue
        }

        if (arg.text === paramName || arg.text.endsWith(`.${paramName}`)) {
            // no need to add a hint for `takeFoo(foo)` or `takeFoo(val.foo)`
            continue
        }

        const argExpr = arg.children[0]
        if (!argExpr) continue

        if (argExpr.type === "object_literal") {
            const type = argExpr.childForFieldName("type")
            if (type !== null) {
                // no need to add a hint for `takeFoo(Foo{})`
                continue
            }

            // but for `takeFoo({})` we want to show hint
        }

        if (argExpr.type === "function_call") {
            const callee = new CallLike(argExpr, params[0].file).calleeName()
            if (paramName === callee?.text) {
                // no need to add a hint for `takeSender(sender())` or `takeSender(foo.sender())`
                continue
            }
        }

        result.push({
            kind: InlayHintKind.Parameter,
            label: [
                {
                    value: paramName,
                    location: toLocation(param.nameNode()),
                },
                {
                    value: ":",
                },
            ],
            position: {
                line: arg.startPosition.row,
                character: arg.startPosition.column,
            },
        })
    }
}
