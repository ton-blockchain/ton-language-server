//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import type {Node as SyntaxNode} from "web-tree-sitter"
import {CompletionItem, InsertTextFormat, CompletionItemKind} from "vscode-languageserver-types"
import {ScopeProcessor} from "@server/languages/tolk/psi/Reference"
import {NamedNode, TolkNode} from "@server/languages/tolk/psi/TolkNode"
import {
    Constant,
    Field,
    Func,
    GlobalVariable,
    InstanceMethod,
    Parameter,
    StaticMethod,
    Struct,
    TypeAlias,
    TypeParameter,
} from "@server/languages/tolk/psi/Decls"
import {CompletionContext} from "./CompletionContext"
import {
    CompletionWeight,
    WeightedCompletionItem,
} from "@server/languages/tolk/completion/WeightedCompletionItem"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {ResolveState} from "@server/psi/ResolveState"
import {TypeInferer} from "@server/languages/tolk/TypeInferer"

export interface CompletionItemAdditionalInformation {
    readonly name: string | undefined
    readonly file: TolkFile | undefined
    readonly elementFile: TolkFile | undefined
    readonly language: "tolk" | "func" | undefined
}

export class ReferenceCompletionProcessor implements ScopeProcessor {
    public constructor(private readonly ctx: CompletionContext) {}

    public result: Map<string, CompletionItem> = new Map()

    private allowedInContext(node: TolkNode): boolean {
        if (this.ctx.isType) {
            if (node instanceof NamedNode) {
                const name = node.name()
                if (
                    name === "builtin_type" ||
                    name === "intN" ||
                    name === "uintN" ||
                    name === "nitsN" ||
                    name === "bytesN"
                ) {
                    // intN-like types  implemented in VariableSizeTypeCompletionProvider
                    return false
                }
            }

            return (
                node instanceof TypeAlias || node instanceof Struct || node instanceof TypeParameter
            )
        }

        if (node instanceof NamedNode) {
            const name = node.name()
            if (name === "__toTuple" || name === "estimatePackSize") {
                return false
            }
        }

        // since structs can be created like `Foo{}` we allow them
        if (node instanceof Struct) return true
        return true
    }

    public execute(node: TolkNode, state: ResolveState): boolean {
        if (!(node instanceof NamedNode)) return true

        const prefix = state.get("prefix") ?? ""
        const rawName = node.name(false)
        const name = node.name()
        if (name.endsWith("DummyIdentifier")) {
            return true
        }

        if (!this.allowedInContext(node)) {
            return true
        }

        const additionalData: CompletionItemAdditionalInformation = {
            elementFile: node.file,
            file: this.ctx.element.file,
            name: name,
            language: "tolk",
        }

        if (node instanceof StaticMethod) {
            const receiverType = node.receiverTypeString()
            const thisPrefix = state.get("need-prefix") ? receiverType + "." : ""

            const signature = node.signaturePresentation(true)
            const hasNoParams = node.parameters(true).length === 0

            const needSemicolon = this.needSemicolon(this.ctx.element.node)

            // We want to place the cursor in parens only if there are any parameters to write.
            // and add brackets only if they are not there yet
            const parensPart = this.ctx.beforeParen ? "" : hasNoParams ? "()" : "($1)"
            const semicolonPart = needSemicolon ? "$2;$0" : ""
            const insertText = thisPrefix + rawName + parensPart + semicolonPart

            this.addItem({
                label: thisPrefix + name,
                kind: CompletionItemKind.Method,
                labelDetails: {
                    detail: signature,
                    description: `of ${receiverType}`,
                },
                insertText: insertText,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.FUNCTION,
                data: additionalData,
            })
        } else if (node instanceof Func || node instanceof InstanceMethod) {
            // don't add `self.` prefix for global functions
            const thisPrefix = prefix !== "" && node instanceof Func ? "" : prefix

            const signature = node.signaturePresentation(true)
            const hasNoParams = node.parameters(true).length === 0

            const needSemicolon = this.needSemicolon(this.ctx.element.node)

            // We want to place the cursor in parens only if there are any parameters to write.
            // and add brackets only if they are not there yet
            const parensPart = this.ctx.beforeParen ? "" : hasNoParams ? "()" : "($1)"
            const semicolonPart = needSemicolon ? "$2;$0" : ""
            const insertText = thisPrefix + rawName + parensPart + semicolonPart

            this.addItem({
                label: thisPrefix + name,
                kind:
                    node instanceof InstanceMethod
                        ? CompletionItemKind.Method
                        : CompletionItemKind.Function,
                labelDetails: {
                    detail: signature,
                },
                insertText: insertText,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.FUNCTION,
                data: additionalData,
            })
        } else if (node instanceof Struct) {
            const emptyStruct = node.fields().length === 0

            // we don't want to add `{}` for type completion or when struct doesn't have
            // any fields like builtin `debug` or `blockchain`
            const bracesSnippet = this.ctx.isType || emptyStruct ? "" : " {$1}"
            const braces = this.ctx.isType || emptyStruct ? "" : " {}"

            this.addItem({
                label: name,
                labelDetails: {
                    detail: braces,
                },
                kind: CompletionItemKind.Struct,
                insertText: `${rawName}${bracesSnippet}$0`,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.STRUCT,
                data: additionalData,
            })
        } else if (node instanceof TypeAlias) {
            this.addItem({
                label: name,
                kind: CompletionItemKind.TypeParameter,
                insertText: `${rawName}$0`,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.TYPE_ALIAS,
                data: additionalData,
            })
        } else if (node instanceof Constant) {
            const typeName = TypeInferer.inferType(node)?.name() ?? "unknown"
            const value = node.value()

            this.addItem({
                label: name,
                kind: CompletionItemKind.Constant,
                labelDetails: {
                    detail: ": " + typeName + " = " + (value?.node.text ?? "unknown"),
                },
                insertText: rawName,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.CONSTANT,
                data: additionalData,
            })
        } else if (node instanceof GlobalVariable) {
            const typeName = TypeInferer.inferType(node)?.name() ?? "unknown"
            this.addItem({
                label: name,
                kind: CompletionItemKind.Variable,
                labelDetails: {
                    detail: ": " + typeName,
                },
                insertText: rawName,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.GLOBAL_VARIABLE,
                data: additionalData,
            })
        } else if (node instanceof Field) {
            const owner = node.owner()?.name() ?? ""

            // don't add `self.` for completion of field in init
            const thisPrefix = this.ctx.inNameOfFieldInit ? "" : prefix
            const comma = this.ctx.inMultilineStructInit ? "," : ""
            const suffix = this.ctx.inNameOfFieldInit ? `: $1${comma}$0` : ""

            const typeNode = node.typeNode()
            const valueType = typeNode?.node.text ?? ""
            const details = this.ctx.inNameOfFieldInit ? `: ${valueType} ` : ": " + valueType
            const labelSuffix = this.ctx.inNameOfFieldInit ? ` ` : "" // needed to distinguish from variable

            this.addItem({
                label: thisPrefix + rawName + labelSuffix,
                kind: CompletionItemKind.Property,
                labelDetails: {
                    detail: details,
                    description: ` of ${owner}`,
                },
                insertText: thisPrefix + rawName + suffix,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.FIELD,
                data: additionalData,
            })
        } else if (node.node.type === "identifier") {
            const parent = node.node.parent
            if (!parent) return true

            if (parent.type === "catch_clause") {
                const typeName = "any"

                this.addItem({
                    label: name,
                    kind: CompletionItemKind.Variable,
                    labelDetails: {
                        description: ` ${typeName}`,
                    },
                    insertText: rawName,
                    insertTextFormat: InsertTextFormat.Snippet,
                    weight: CompletionWeight.VARIABLE,
                    data: additionalData,
                })
            }
        } else if (node.node.type === "var_declaration") {
            const typeName = TypeInferer.inferType(node)?.name() ?? "unknown"

            const comma = this.ctx.inMultilineStructInit ? "," : ""
            const suffix = this.ctx.inNameOfFieldInit ? `${comma}$0` : ""

            this.addItem({
                label: name,
                kind: CompletionItemKind.Variable,
                labelDetails: {
                    description: ` ${typeName}`,
                },
                insertText: rawName + suffix,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.VARIABLE,
                data: additionalData,
            })
        } else if (node instanceof Parameter) {
            const parent = node.node.parent
            if (!parent) return true

            const comma = this.ctx.inMultilineStructInit ? "," : ""
            const suffix = this.ctx.inNameOfFieldInit ? `${comma}$0` : ""

            const type = node.typeNode()
            const typeName = type?.node.text ?? "unknown"

            this.addItem({
                label: name,
                kind: CompletionItemKind.Variable,
                labelDetails: {
                    description: ` ${typeName}`,
                },
                insertText: rawName + suffix,
                insertTextFormat: InsertTextFormat.Snippet,
                weight: CompletionWeight.PARAM,
                data: additionalData,
            })
        } else if (node instanceof TypeParameter) {
            const defaultType = node.defaultTypePresentation()
            this.addItem({
                label: name,
                labelDetails: {
                    detail: defaultType,
                    description: `type parameter`,
                },
                insertText: rawName,
                kind: CompletionItemKind.TypeParameter,
                weight: CompletionWeight.PARAM,
                data: additionalData,
            })
        } else {
            this.addItem({
                label: name,
                insertText: rawName,
                weight: CompletionWeight.LOWEST,
            })
        }

        return true
    }

    private needSemicolon(node: SyntaxNode): boolean {
        if (this.ctx.beforeSemicolon) {
            return false
        }

        if (this.ctx.isStatement) {
            return true
        }

        const parent = node.parent
        if (parent?.type === "dot_access") {
            const obj = parent.childForFieldName("obj")
            if (obj?.equals(node)) {
                // foo.bar<caret>.field
                return false
            }
            return this.needSemicolon(parent)
        }
        if (parent?.type === "expression_statement") {
            // just
            // ...
            // foo()
            // ...
            // in block statement
            return true
        }
        if (parent?.type === "local_vars_declaration") {
            // add `;` for variable declarations
            // val foo = some<caret>
            //         = someFunc();

            const grand = parent.parent
            if (grand?.type !== "block_statement") {
                // skip cases like:
                // match (val a = 10) {}
                return false
            }

            return parent.childForFieldName("assigned_val")?.equals(node) ?? false
        }
        if (parent?.type === "assignment" || parent?.type === "set_assignment") {
            // add `;` for assign declarations
            // foo = some<caret>
            //     = someFunc();

            const grand = parent.parent
            if (grand?.type !== "expression_statement") {
                // skip cases like:
                // if (a = 10)
                return false
            }

            return parent.childForFieldName("right")?.equals(node) ?? false
        }

        return false
    }

    public addItem(node: WeightedCompletionItem): void {
        if (node.label === "") return
        const lookup = this.lookupString(node)
        const prev = this.result.get(lookup)
        if (prev && prev.kind === node.kind) return
        this.result.set(lookup, node)
    }

    private lookupString(item: WeightedCompletionItem): string {
        return (item.kind ?? 1).toString() + item.label
    }
}
