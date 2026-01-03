//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import {AsyncCompletionProvider} from "@server/completion/CompletionProvider"
import {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult} from "@server/completion/WeightedCompletionItem"

export abstract class ActonStringArgumentCompletionProvider
    implements AsyncCompletionProvider<CompletionContext>
{
    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.insideString
    }

    public async addCompletion(ctx: CompletionContext, result: CompletionResult): Promise<void> {
        const node = ctx.element.node
        let parent = node.parent
        if (parent && parent.type === "call_argument") {
            // ok
        } else if (parent && parent.parent && parent.parent.type === "call_argument") {
            parent = parent.parent
        } else {
            return
        }

        const argList = parent.parent
        if (!argList || argList.type !== "argument_list") return

        const call = argList.parent
        if (!call || call.type !== "function_call") return

        const callee = call.childForFieldName("callee")
        if (!callee) return

        let functionName: string | undefined
        let qualifierName: string | undefined

        if (callee.type === "dot_access") {
            const field = callee.childForFieldName("field")
            const obj = callee.childForFieldName("obj")
            if (field) functionName = field.text
            if (obj) qualifierName = obj.text
        } else if (callee.type === "identifier") {
            functionName = callee.text
        }

        if (!functionName) return

        const args = argList.children.filter(c => c !== null && c.type === "call_argument")
        const argIndex = args.findIndex(arg => arg?.id === parent.id)

        if (this.shouldAddCompletions(functionName, qualifierName, argIndex)) {
            await this.addStringCompletions(ctx, result, functionName, qualifierName, argIndex)
        }
    }

    protected abstract shouldAddCompletions(
        functionName: string,
        qualifierName: string | undefined,
        argumentIndex: number,
    ): boolean

    protected abstract addStringCompletions(
        ctx: CompletionContext,
        result: CompletionResult,
        functionName: string,
        qualifierName: string | undefined,
        argumentIndex: number,
    ): Promise<void>
}
