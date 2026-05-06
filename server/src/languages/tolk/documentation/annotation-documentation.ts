import type {Node as SyntaxNode} from "web-tree-sitter"
import * as lsp from "vscode-languageserver"

import {asLspRange} from "@server/utils/position"

export function documentationForAnnotation(hoverNode: SyntaxNode): lsp.Hover | null {
    const name = hoverNode.text
    const info = annotationInfo(name)

    if (info) {
        return {
            range: asLspRange(hoverNode),
            contents: {
                kind: "markdown",
                value: info.description,
            },
        }
    }

    return null
}

function annotationInfo(name: string): AnnotationInfo | undefined {
    return ANNOTATIONS_INFO[name] ?? ANNOTATIONS_INFO[name.split(".")[0]]
}

interface AnnotationInfo {
    readonly description: string
}

const ANNOTATIONS_INFO: Record<string, AnnotationInfo> = {
    inline: {
        description:
            "Function with this annotation will be automatically inlined during compilation",
    },
    inline_ref: {
        description:
            "Function with this annotation will be automatically inlined by reference during compilation",
    },
    noinline: {
        description:
            "Function with this annotation will not be inlined even if compiler can inline it",
    },
    pure: {
        description:
            "Function with this annotation has no side effects and can be optimized away by the compiler",
    },
    deprecated: {
        description:
            "Symbol with this annotation is deprecated and should not be used in new code. First string argument is a reason for deprecation as a string literal.",
    },
    overflow1023_policy: {
        description:
            'Defines the policy for handling potential builder overflow. Right now, only `"suppress"` value is supported. See <https://docs.ton.org/v3/documentation/smart-contracts/tolk/tolk-vs-func/pack-to-from-cells#what-if-data-exceeds-1023-bits> for more details',
    },
    on_bounced_policy: {
        description:
            'Defines the policy for handling bounced messages. Right now, only `"manual"` value is supported.',
    },
    method_id: {
        description:
            "Specifies the method ID (as a number literal) for the function in smart contract interface. See <https://docs.ton.org/v3/guidelines/smart-contracts/get-methods> for more details",
    },
    abi: {
        description: "Describes ABI metadata for a declaration.",
    },
    "abi.minimalMsgValue": {
        description: "Defines the minimal message value for a message struct in ABI metadata.",
    },
    "abi.preferredSendMode": {
        description: "Defines the preferred send mode for a message struct in ABI metadata.",
    },
    "abi.clientType": {
        description:
            "Overrides the client-facing ABI type for a struct field. This is useful when generated wrappers should expose a different representation than the serialized Tolk field type.",
    },
    test: {
        description:
            "Describes additional metadata for a test function, such as skipping, TODO state, expected exit code, gas limit, or fuzzing configuration.",
    },
    "test.skip": {
        description: "Marks the test as skipped.",
    },
    "test.todo": {
        description: 'Marks the test as TODO. Use `@test.todo("...")` to attach a description.',
    },
    "test.fail_with": {
        description: "Declares the expected exit code for the test.",
    },
    "test.gas_limit": {
        description: "Overrides the per-test gas limit.",
    },
    "test.fuzz": {
        description:
            "Enables fuzzing for parameterized tests. Supports `@test.fuzz`, `@test.fuzz(64)`, and `@test.fuzz({ ... })`.",
    },
} as const
