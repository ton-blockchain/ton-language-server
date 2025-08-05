//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type {Node as SyntaxNode} from "web-tree-sitter"
import {RecursiveVisitor} from "@server/visitor/visitor"
import {NamedNode, TolkNode} from "./TolkNode"
import {Reference} from "./Reference"
import type {TolkFile} from "./TolkFile"
import {parentOfType} from "@server/psi/utils"
import {TOLK_PARSED_FILES_CACHE} from "@server/files"
import {BaseReferent, GlobalSearchScope, LocalSearchScope} from "@server/references/referent"
import {File} from "@server/psi/File"

class TolkGlobalSearchScope extends GlobalSearchScope<File> {
    public static allFiles(): GlobalSearchScope<File> {
        const files = [...TOLK_PARSED_FILES_CACHE.values()]
        return new GlobalSearchScope(files)
    }

    public static importedFiles(file: TolkFile): GlobalSearchScope<File> {
        if (file.fromStdlib || file.fromStubs) {
            // common.tolk implicitly included everywhere
            return this.allFiles()
        }

        return new GlobalSearchScope([file, ...file.importedBy()])
    }
}

export class Referent extends BaseReferent<NamedNode> {
    public readonly resolved: NamedNode | null = null

    public constructor(node: SyntaxNode, file: TolkFile) {
        super(file)
        const element = new NamedNode(node, file)
        this.resolved = Reference.resolve(element)
    }

    public override traverseTree(
        file: TolkFile,
        node: SyntaxNode,
        result: TolkNode[],
        limit: number,
    ): void {
        const resolved = this.resolved
        if (!resolved) return

        // The algorithm for finding references is simple:
        // we traverse the node that contains all the uses and resolve
        // each identifier with the same name as searched symbol.
        // If that identifier refers to the definition we are looking for,
        // we add it to the list.
        RecursiveVisitor.visit(node, (node): boolean | "stop" => {
            // fast path, skip non identifiers
            if (node.type !== "identifier" && node.type !== "type_identifier") {
                return true
            }
            // fast path, identifier name doesn't equal to definition name
            // self can refer to enclosing method
            const nodeName = node.text
            if (nodeName !== resolved.name(false)) {
                return true
            }

            const parent = node.parent
            if (parent === null) return true

            // skip definitions itself
            // prettier-ignore
            if ((
                parent.type === "global_var_declaration" ||
                parent.type === "function_declaration" ||
                parent.type === "method_declaration" ||
                parent.type === "get_method_declaration" ||
                parent.type === "constant_declaration" ||
                parent.type === "type_alias_declaration" ||
                parent.type === "struct_declaration" ||
                parent.type === "struct_field_declaration" ||
                parent.type === "type_parameter" ||
                parent.type === "parameter_declaration") && parent.childForFieldName("name")?.equals(node)
            ) {
                return true
            }

            if (
                parent.type === "var_declaration" &&
                parent.childForFieldName("name")?.equals(node)
            ) {
                if (parent.childForFieldName("redef") === null) {
                    return true
                }
                // don't treat redef as standalone variable
            }

            if (node.type === "type_identifier" && parent.type === "instantiationT_list") {
                const grand = parent.parent?.parent
                if (grand?.type === "method_receiver") {
                    // T in `fun Foo<T>.bar() {}`
                    return true
                }
            }

            const resolvedNode = Reference.multiResolve(new NamedNode(node, file))

            if (
                node.type === "type_identifier" &&
                parent.type === "method_receiver" &&
                parent.childForFieldName("receiver_type")?.equals(node) &&
                resolvedNode.length === 1 && // resolved only to itself
                resolvedNode[0].node.equals(node)
            ) {
                // T in `fun T.bar() {}`
                return true
            }

            for (const target of resolvedNode) {
                const identifier = target.nameIdentifier()
                if (!identifier) return true

                if (
                    target.node.type === resolved.node.type &&
                    target.file.uri === resolved.file.uri &&
                    target.node.startPosition.row === resolved.node.startPosition.row &&
                    identifier.text === resolved.name(false)
                ) {
                    // found new reference
                    result.push(new TolkNode(node, file))
                    if (result.length === limit) return "stop" // end iteration
                }
            }
            return true
        })
    }

    /**
     * Returns the effective node in which all possible usages are expected.
     * Outside this node, no usages are assumed to exist. For example, a variable
     * can be used only in outer block statement where it is defined.
     */
    public override useScope(): LocalSearchScope | GlobalSearchScope<File> | null {
        if (!this.resolved) return null

        const node = this.resolved.node

        const parent = this.resolved.node.parent
        if (parent === null) return null

        if (node.type === "var_declaration") {
            // search only in outer block/function
            const ownerBlock = parentOfType(parent, "block_statement")
            if (ownerBlock?.parent?.type === "do_while_statement") {
                // for
                // do {
                //   var a = 100;
                // } while (a);
                // search in while condition as well
                return Referent.localSearchScope(ownerBlock.parent)
            }
            return Referent.localSearchScope(ownerBlock)
        }

        if (parent.type === "catch_clause") {
            // search only in catch block
            return Referent.localSearchScope(parent.lastChild)
        }

        if (node.type === "parameter_declaration") {
            const grand = node.parent?.parent
            if (
                grand?.type === "function_declaration" ||
                grand?.type === "method_declaration" ||
                grand?.type === "get_method_declaration"
            ) {
                // search in function body
                return Referent.localSearchScope(grand.lastChild)
            }
        }

        if (
            node.type === "global_var_declaration" ||
            node.type === "function_declaration" ||
            node.type === "method_declaration" ||
            node.type === "get_method_declaration" ||
            node.type === "constant_declaration" ||
            node.type === "struct_declaration" ||
            node.type === "type_alias_declaration"
        ) {
            return TolkGlobalSearchScope.importedFiles(this.resolved.file)
        }

        if (node.type === "struct_field_declaration") {
            return TolkGlobalSearchScope.importedFiles(this.resolved.file)
        }

        if (node.type === "type_identifier" && parent.type === "instantiationT_list") {
            // T in `fun Foo<T>.bar() {}`, search only in outer method
            return Referent.localSearchScope(parentOfType(parent, "method_declaration"))
        }

        if (
            node.type === "type_identifier" &&
            parent.type === "method_receiver" &&
            parent.childForFieldName("receiver_type")?.equals(node)
        ) {
            // T in `fun T.bar() {}`, search only in outer method
            return Referent.localSearchScope(parentOfType(parent, "method_declaration"))
        }

        if (node.type === "type_parameter") {
            return Referent.localSearchScope(
                parentOfType(
                    parent,
                    "function_declaration",
                    "method_declaration",
                    "struct_declaration",
                    "type_alias_declaration",
                ),
            )
        }

        return null
    }

    private static localSearchScope(node: SyntaxNode | null): LocalSearchScope | null {
        if (!node) return null
        return new LocalSearchScope(node)
    }
}
