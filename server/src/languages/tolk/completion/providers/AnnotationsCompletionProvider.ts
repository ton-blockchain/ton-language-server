//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {CompletionItemKind, InsertTextFormat} from "vscode-languageserver-types"
import type {Node as SyntaxNode} from "web-tree-sitter"

import type {CompletionProvider} from "@server/completion/CompletionProvider"
import type {CompletionContext} from "@server/languages/tolk/completion/CompletionContext"
import {CompletionResult, CompletionWeight} from "@server/completion/WeightedCompletionItem"
import {parentOfType} from "@server/psi/utils"

type AnnotationOwnerKind = "function" | "getMethod" | "struct" | "field" | "entryPoint" | "any"

interface AnnotationLookup {
    readonly label: string
    readonly fullName: string
    readonly ownerKinds: readonly AnnotationOwnerKind[]
    readonly insertText?: string
}

export class AnnotationsCompletionProvider implements CompletionProvider<CompletionContext> {
    private readonly rootAnnotations: readonly AnnotationLookup[] = [
        {label: "inline", fullName: "inline", ownerKinds: ["function", "getMethod"]},
        {label: "pure", fullName: "pure", ownerKinds: ["function", "getMethod"]},
        {label: "inline_ref", fullName: "inline_ref", ownerKinds: ["function", "getMethod"]},
        {label: "noinline", fullName: "noinline", ownerKinds: ["function", "getMethod"]},
        {label: "test", fullName: "test", ownerKinds: ["getMethod"]},
        {
            label: "method_id",
            fullName: "method_id",
            ownerKinds: ["function", "getMethod"],
            insertText: "method_id(${0:0x1})",
        },
        {
            label: "abi.minimalMsgValue",
            fullName: "abi.minimalMsgValue",
            ownerKinds: ["struct"],
            insertText: "abi.minimalMsgValue($0)",
        },
        {
            label: "abi.preferredSendMode",
            fullName: "abi.preferredSendMode",
            ownerKinds: ["struct"],
            insertText: "abi.preferredSendMode($0)",
        },
        {
            label: "abi.clientType",
            fullName: "abi.clientType",
            ownerKinds: ["field"],
            insertText: "abi.clientType($0)",
        },
        {
            label: "deprecated",
            fullName: "deprecated",
            ownerKinds: ["any"],
            insertText: 'deprecated("$0")',
        },
        {label: "custom", fullName: "custom", ownerKinds: ["any"], insertText: "custom($0)"},
        {
            label: "overflow1023_policy",
            fullName: "overflow1023_policy",
            ownerKinds: ["struct"],
            insertText: 'overflow1023_policy("${0:suppress}")',
        },
        {
            label: "on_bounced_policy",
            fullName: "on_bounced_policy",
            ownerKinds: ["entryPoint"],
            insertText: 'on_bounced_policy("${0:manual}")',
        },
    ]

    private readonly abiAnnotations: readonly AnnotationLookup[] = [
        {
            label: "minimalMsgValue",
            fullName: "abi.minimalMsgValue",
            ownerKinds: ["struct"],
            insertText: "minimalMsgValue($0)",
        },
        {
            label: "preferredSendMode",
            fullName: "abi.preferredSendMode",
            ownerKinds: ["struct"],
            insertText: "preferredSendMode($0)",
        },
        {
            label: "clientType",
            fullName: "abi.clientType",
            ownerKinds: ["field"],
            insertText: "clientType($0)",
        },
    ]

    private readonly testAnnotations: readonly AnnotationLookup[] = [
        {label: "skip", fullName: "test.skip", ownerKinds: ["getMethod"]},
        {label: "todo", fullName: "test.todo", ownerKinds: ["getMethod"]},
        {
            label: "todo",
            fullName: "test.todo",
            ownerKinds: ["getMethod"],
            insertText: 'todo("$0")',
        },
        {
            label: "fail_with",
            fullName: "test.fail_with",
            ownerKinds: ["getMethod"],
            insertText: "fail_with($0)",
        },
        {
            label: "gas_limit",
            fullName: "test.gas_limit",
            ownerKinds: ["getMethod"],
            insertText: "gas_limit($0)",
        },
        {label: "fuzz", fullName: "test.fuzz", ownerKinds: ["getMethod"]},
        {
            label: "fuzz",
            fullName: "test.fuzz",
            ownerKinds: ["getMethod"],
            insertText: "fuzz($0)",
        },
    ]

    public isAvailable(ctx: CompletionContext): boolean {
        return ctx.isAnnotationName
    }

    public addCompletion(ctx: CompletionContext, result: CompletionResult): void {
        const pathPrefix = this.annotationPathPrefix(ctx)
        if (pathPrefix === null) {
            return
        }

        const owner = this.annotationOwner(ctx)
        const existingAnnotations = this.existingAnnotations(owner)

        for (const annotation of this.lookupAnnotations(pathPrefix)) {
            if (existingAnnotations.has(annotation.fullName)) {
                continue
            }
            if (!this.isApplicable(annotation, owner)) {
                continue
            }

            result.add({
                label: annotation.label,
                kind: CompletionItemKind.Event,
                insertTextFormat: InsertTextFormat.Snippet,
                insertText: annotation.insertText ?? annotation.label,
                weight: CompletionWeight.SNIPPET,
            })
        }
    }

    private lookupAnnotations(pathPrefix: string): readonly AnnotationLookup[] {
        const root = pathPrefix.split(".")[0]
        if (!pathPrefix.includes(".")) {
            return this.rootAnnotations
        }

        switch (root) {
            case "abi": {
                return this.abiAnnotations
            }
            case "test": {
                return this.testAnnotations
            }
            default: {
                return []
            }
        }
    }

    private annotationPathPrefix(ctx: CompletionContext): string | null {
        const line = ctx.element.file.content.split(/\n/g).at(ctx.position.line)
        if (line === undefined) {
            return null
        }

        const end = Math.min(ctx.position.character, line.length)
        let start = end
        while (start > 0) {
            const char = line[start - 1]
            if (this.isAnnotationPathChar(char)) {
                start--
                continue
            }
            break
        }

        if (start === 0 || line[start - 1] !== "@") {
            return null
        }

        return line.slice(start, end)
    }

    private isAnnotationPathChar(char: string): boolean {
        return /[\dA-Z_.]/iu.test(char)
    }

    private annotationOwner(ctx: CompletionContext): SyntaxNode | null {
        return parentOfType(
            ctx.element.node,
            "function_declaration",
            "get_method_declaration",
            "method_declaration",
            "struct_declaration",
            "struct_field_declaration",
            "global_var_declaration",
            "constant_declaration",
            "type_alias_declaration",
            "enum_declaration",
        )
    }

    private existingAnnotations(owner: SyntaxNode | null): Set<string> {
        const annotationsNode = owner?.childForFieldName("annotations")
        if (!annotationsNode) {
            return new Set()
        }

        return new Set(
            annotationsNode.namedChildren
                .map(annotation => annotation?.childForFieldName("name")?.text)
                .filter((name): name is string => name !== undefined),
        )
    }

    private isApplicable(annotation: AnnotationLookup, owner: SyntaxNode | null): boolean {
        if (annotation.ownerKinds.includes("any")) {
            return true
        }
        if (!owner) {
            return true
        }

        return annotation.ownerKinds.some(kind => this.ownerMatches(kind, owner))
    }

    private ownerMatches(kind: AnnotationOwnerKind, owner: SyntaxNode): boolean {
        switch (kind) {
            case "any": {
                return true
            }
            case "function": {
                return (
                    owner.type === "function_declaration" ||
                    owner.type === "method_declaration" ||
                    owner.type === "get_method_declaration"
                )
            }
            case "getMethod": {
                return owner.type === "get_method_declaration"
            }
            case "struct": {
                return owner.type === "struct_declaration"
            }
            case "field": {
                return owner.type === "struct_field_declaration"
            }
            case "entryPoint": {
                if (owner.type !== "function_declaration") {
                    return false
                }

                const name = owner.childForFieldName("name")?.text
                return (
                    name === "onInternalMessage" ||
                    name === "onExternalMessage" ||
                    name === "onBouncedMessage"
                )
            }
        }
        return false
    }
}
