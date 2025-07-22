//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import type {Node as SyntaxNode} from "web-tree-sitter"
import {RecursiveVisitor} from "@server/visitor/visitor"
import {NamedNode, FuncNode} from "./FuncNode"
import {Reference} from "./Reference"
import type {FuncFile} from "./FuncFile"
import {parentOfType} from "@server/psi/utils"
import {BaseReferent, GlobalSearchScope, LocalSearchScope} from "@server/references/referent"
import {File} from "@server/psi/File"
import {FUNC_PARSED_FILES_CACHE} from "@server/files"

class FuncGlobalSearchScope extends GlobalSearchScope<File> {
    public static allFiles(): GlobalSearchScope<File> {
        const files = [...FUNC_PARSED_FILES_CACHE.values()]
        return new GlobalSearchScope(files)
    }
}

export class Referent extends BaseReferent<NamedNode> {
    public readonly resolved: NamedNode | null = null

    public constructor(node: SyntaxNode, file: FuncFile) {
        super(file)
        const element = new NamedNode(node, file)
        this.resolved = Reference.resolve(element)
    }

    public override traverseTree(
        file: FuncFile,
        node: SyntaxNode,
        result: FuncNode[],
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
                parent.type === "constant_declaration" ||
                parent.type === "var_declaration" ||
                parent.type === "type_parameter" ||
                parent.type === "parameter_declaration") && parent.childForFieldName("name")?.equals(node)
            ) {
                return true
            }

            const target = Reference.resolve(new NamedNode(node, file))
            if (!target) return true

            const identifier = target.nameIdentifier()
            if (!identifier) return true

            if (
                target.node.type === resolved.node.type &&
                target.file.uri === resolved.file.uri &&
                target.node.startPosition.row === resolved.node.startPosition.row &&
                identifier.text === resolved.name(false)
            ) {
                // found new reference
                result.push(new FuncNode(node, file))
                if (result.length === limit) return "stop" // end iteration
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
                // } until (a);
                // search in until condition as well
                return Referent.localSearchScope(ownerBlock.parent)
            }
            return Referent.localSearchScope(ownerBlock)
        }

        if (parent.type === "tensor_expression" && parent.parent?.type === "catch_clause") {
            // search only in catch block
            return Referent.localSearchScope(parent.parent.lastChild)
        }

        if (node.type === "parameter_declaration") {
            const grand = node.parent?.parent
            if (grand?.type === "function_declaration") {
                // search in function body
                return Referent.localSearchScope(grand.lastChild)
            }
        }

        if (
            node.type === "global_var_declaration" ||
            node.type === "function_declaration" ||
            node.type === "constant_declaration"
        ) {
            return FuncGlobalSearchScope.allFiles()
        }

        if (node.type === "type_parameter") {
            return Referent.localSearchScope(parentOfType(parent, "function_declaration"))
        }

        return null
    }

    private static localSearchScope(node: SyntaxNode | null): LocalSearchScope | null {
        if (!node) return null
        return new LocalSearchScope(node)
    }
}
