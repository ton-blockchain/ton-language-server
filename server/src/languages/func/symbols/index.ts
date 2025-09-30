import * as lsp from "vscode-languageserver"
import {SymbolKind} from "vscode-languageserver"

import {NamedNode, FuncNode} from "@server/languages/func/psi/FuncNode"
import {Constant, Func, GlobalVariable} from "@server/languages/func/psi/Decls"
import {asLspRange, asNullableLspRange} from "@server/utils/position"
import {ScopeProcessor} from "@server/languages/func/psi/Reference"
import {index, IndexKey} from "@server/languages/func/indexes"
import {ResolveState} from "@server/psi/ResolveState"
import {FuncFile} from "@server/languages/func/psi/FuncFile"

export function provideFuncDocumentSymbols(file: FuncFile): lsp.DocumentSymbol[] {
    const result: lsp.DocumentSymbol[] = []

    function symbolDetail(element: NamedNode | Func | Constant | GlobalVariable): string {
        if (element instanceof Func) {
            return element.signaturePresentation(true, true)
        }
        if (element instanceof Constant) {
            const type = element.typeNode()?.node.text ?? "unknown"
            const value = element.value()?.node.text ?? "unknown"
            return `: ${type} = ${value}`
        }
        if (element instanceof GlobalVariable) {
            const type = element.typeNode()?.node.text ?? "unknown"
            return `: ${type}`
        }
        return ""
    }

    function createSymbol(element: NamedNode): lsp.DocumentSymbol {
        const detail = symbolDetail(element)
        const kind = symbolKind(element)

        return {
            name: symbolName(element),
            kind: kind,
            range: asLspRange(element.node),
            detail: detail,
            selectionRange: asNullableLspRange(element.nameIdentifier()),
        }
    }

    file.imports().forEach(imp => {
        result.push({
            name: imp.text,
            range: asLspRange(imp),
            selectionRange: asLspRange(imp),
            kind: SymbolKind.Module,
        })
    })

    file.getFunctions().forEach(n => result.push(createSymbol(n)))
    file.getConstants().forEach(n => result.push(createSymbol(n)))
    file.getGlobalVariables().forEach(n => result.push(createSymbol(n)))

    return result.sort((a, b) => a.range.start.line - b.range.start.line)
}

export function provideFuncWorkspaceSymbols(): lsp.WorkspaceSymbol[] {
    const result: lsp.WorkspaceSymbol[] = []

    const state = new ResolveState()
    const proc = new (class implements ScopeProcessor {
        public execute(node: FuncNode, _state: ResolveState): boolean {
            if (!(node instanceof NamedNode)) return true
            const nameIdentifier = node.nameIdentifier()
            if (!nameIdentifier) return true

            result.push({
                name: symbolName(node),
                containerName: "",
                kind: symbolKind(node),
                location: {
                    uri: node.file.uri,
                    range: asLspRange(nameIdentifier),
                },
            })
            return true
        }
    })()

    index.processElementsByKey(IndexKey.GlobalVariables, proc, state)
    index.processElementsByKey(IndexKey.Funcs, proc, state)
    index.processElementsByKey(IndexKey.Constants, proc, state)

    return result
}

function symbolName(element: NamedNode): string {
    return element.name()
}

function symbolKind(node: NamedNode): lsp.SymbolKind {
    if (node instanceof Func) {
        return lsp.SymbolKind.Function
    }
    if (node instanceof Constant) {
        return lsp.SymbolKind.Constant
    }
    if (node instanceof GlobalVariable) {
        return lsp.SymbolKind.Variable
    }
    return lsp.SymbolKind.Object
}
