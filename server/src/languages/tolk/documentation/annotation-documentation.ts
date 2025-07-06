import type {Node as SyntaxNode} from "web-tree-sitter"
import * as lsp from "vscode-languageserver"
import {asLspRange} from "@server/utils/position"

export function documentationForAnnotation(hoverNode: SyntaxNode): lsp.Hover | null {
    const name = hoverNode.text

    if (name in ANNOTATIONS_INFO) {
        const info = ANNOTATIONS_INFO[name as keyof typeof ANNOTATIONS_INFO]
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

const ANNOTATIONS_INFO = {
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
} as const
