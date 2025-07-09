//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {File} from "@server/psi/File"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {ImportResolver} from "@server/languages/func/psi/ImportResolver"
import {NamedNode} from "@server/languages/func/psi/FuncNode"
import {Constant, Func, GlobalVariable} from "@server/languages/func/psi/Decls"

export class FuncFile extends File {
    public get fromStdlib(): boolean {
        return this.uri.includes("stdlib.fc")
    }

    public get fromStubs(): boolean {
        return this.uri.endsWith("stubs.fc")
    }

    public symbolAt(offset: number): string {
        return this.content[offset] ?? ""
    }

    public imports(): SyntaxNode[] {
        return this.tree.rootNode.children
            .filter(node => node !== null && node.type === "import_directive")
            .filter(node => node !== null)
    }

    public importedFiles(): string[] {
        const imports = this.imports()
            .map(node => node.childForFieldName("path"))
            .filter(node => node !== null)
        return imports
            .map(it => ImportResolver.resolveImport(this, it.text.slice(1, -1)))
            .filter(it => it !== null)
    }

    public getFunctions(): Func[] {
        return this.getNodesByType("function_declaration", Func)
    }

    public getGlobalVariables(): GlobalVariable[] {
        const decls = this.tree.rootNode.children
            .filter(node => node !== null && node.type === "global_var_declarations")
            .filter(node => node !== null)

        return decls.flatMap(it =>
            it
                .childrenForFieldName("decls")
                .filter(it => it?.type === "global_var_declaration")
                .filter(it => it !== null)
                .map(node => new GlobalVariable(node, this)),
        )
    }

    public getConstants(): Constant[] {
        const decls = this.tree.rootNode.children
            .filter(node => node !== null && node.type === "constant_declarations")
            .filter(node => node !== null)

        return decls.flatMap(it =>
            it
                .childrenForFieldName("decls")
                .filter(it => it?.type === "constant_declaration")
                .filter(it => it !== null)
                .map(node => new Constant(node, this)),
        )
    }

    private getNodesByType<T extends NamedNode>(
        nodeType: string | string[],
        constructor: new (node: SyntaxNode, file: FuncFile) => T,
    ): T[] {
        const tree = this.tree
        const types = Array.isArray(nodeType) ? nodeType : [nodeType]

        return tree.rootNode.children
            .filter(node => node !== null && types.includes(node.type))
            .filter(node => node !== null)
            .map(node => new constructor(node, this))
    }
}
