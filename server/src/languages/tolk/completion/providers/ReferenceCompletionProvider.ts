//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {Reference, ScopeProcessor} from "@server/languages/tolk/psi/Reference"
import {ReferenceCompletionProcessor} from "@server/languages/tolk/completion/ReferenceCompletionProcessor"
import {NamedNode, TolkNode} from "@server/languages/tolk/psi/TolkNode"
import type {CompletionResult} from "@server/completion/WeightedCompletionItem"
import {ResolveState} from "@server/psi/ResolveState"
import {FieldsOwnerTy} from "@server/languages/tolk/types/ty"
import {typeOf} from "@server/languages/tolk/type-inference"
import {index, IndexKey} from "@server/languages/tolk/indexes"
import {Enum} from "@server/languages/tolk/psi/Decls"

enum CompletionKind {
    ONLY_FIELDS = "ONLY_FIELDS",
    ALL = "ALL",
}

export class ReferenceCompletionProvider implements CompletionProvider<CompletionContext> {
    public constructor(private readonly ref: Reference) {}

    public isAvailable(ctx: CompletionContext): boolean {
        return (
            !ctx.topLevel &&
            !ctx.insideImport &&
            !ctx.isAnnotationName &&
            !ctx.structTopLevel &&
            !ctx.catchVariable &&
            !ctx.isFunctionName &&
            !ctx.isMethodName &&
            !ctx.expectFieldModifier &&
            !ctx.expectMatchArm
        )
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        const state = new ResolveState()
        const processor = new ReferenceCompletionProcessor(ctx)

        const kind = this.processFields(processor, state, ctx)

        // process usual autocompletion for only non-instance expressions
        if (kind === CompletionKind.ALL) {
            this.ref.processResolveVariants(processor, state.withValue("completion", "true"))
        }

        index.processElementsByKey(
            IndexKey.Enums,
            new (class implements ScopeProcessor {
                public execute(node: Enum, state: ResolveState): boolean {
                    for (const member of node.members()) {
                        if (!processor.execute(member, state.withValue("need-prefix", "true"))) {
                            return false
                        }
                    }
                    return true
                }
            })(),
            state,
        )

        // TODO: think about case:
        //   debug.pr<caret>
        //
        // index.processElementsByKey(
        //     IndexKey.Methods,
        //     new (class implements ScopeProcessor {
        //         public execute(node: InstanceMethod | StaticMethod, state: ResolveState): boolean {
        //             if (node instanceof InstanceMethod) return true
        //             if (node.receiverType() === "T") return true
        //             return processor.execute(node, state.withValue("need-prefix", "true"))
        //         }
        //     })(),
        //     state,
        // )

        result.add(...processor.result.values())
    }

    public processFields(
        processor: ScopeProcessor,
        state: ResolveState,
        ctx: CompletionContext,
    ): CompletionKind {
        if (ctx.afterDot) return CompletionKind.ALL

        const parent = ctx.element.node.parent
        // Foo { value: 10 }
        //     ^^^^^^^^^^^^^ looking for
        if (parent?.type !== "instance_argument") return CompletionKind.ALL

        // Foo { value: 10 }
        //       ^^^^^ this
        const name = parent.childForFieldName("name")
        if (!name) return CompletionKind.ALL
        if (!name.equals(ctx.element.node)) return CompletionKind.ALL

        // Foo { value: 10 }
        // ^^^^^^^^^^^^^^^^^ this
        const grand = parent.parent?.parent
        if (grand?.type !== "object_literal") return CompletionKind.ALL

        // Foo { value: 10 }
        // ^^^ this
        // or
        // val foo: Foo = { value: 10 }
        //          ^^^^ this
        const instanceType = typeOf(grand, ctx.element.file)?.baseType()
        if (!instanceType) return CompletionKind.ALL
        if (!(instanceType instanceof FieldsOwnerTy)) return CompletionKind.ALL

        const fields = instanceType.fields()

        const initializedFieldsNode = grand.childForFieldName("arguments")
        if (!initializedFieldsNode) return CompletionKind.ALL
        const initializedFields = initializedFieldsNode.children
            .filter(it => it?.type === "instance_argument")
            .filter(it => it !== null)

        const fieldNames: Set<string> = new Set()
        for (const field of fields) {
            fieldNames.add(field.name())
        }

        const alreadyInitialized: Set<string> = new Set()
        for (const it of initializedFields) {
            const name = it.childForFieldName("name")
            if (!name) continue
            const fieldName = name.text
            alreadyInitialized.add(fieldName)
        }

        for (const field of fields) {
            if (alreadyInitialized.has(field.name())) continue
            if (!processor.execute(field, state)) break
        }

        const variablesProcessor = new (class implements ScopeProcessor {
            public execute(node: TolkNode, state: ResolveState): boolean {
                if (
                    node.node.type !== "var_declaration" &&
                    node.node.type !== "parameter_declaration"
                ) {
                    return true
                }

                const name = node instanceof NamedNode ? node.name() : node.node.text
                if (!fieldNames.has(name) || alreadyInitialized.has(name)) {
                    // no such field for short initialization
                    // or already initialized
                    return true
                }

                return processor.execute(node, state)
            }
        })()

        this.ref.processBlock(variablesProcessor, state)

        return CompletionKind.ONLY_FIELDS
    }
}
