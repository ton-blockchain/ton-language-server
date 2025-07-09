//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {File} from "@server/psi/File"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {ImportResolver} from "@server/languages/func/psi/ImportResolver"

export class FuncFile extends File {
    public get fromStdlib(): boolean {
        return this.uri.includes("stdlib.fc")
    }

    public get fromStubs(): boolean {
        return this.uri.endsWith("stubs.fc")
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
}
