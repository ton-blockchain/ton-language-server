import * as lsp from "vscode-languageserver"
import {SymbolKind} from "vscode-languageserver"

import {NamedNode, TolkNode} from "@server/languages/tolk/psi/TolkNode"
import {
    Constant,
    Enum,
    EnumMember,
    Field,
    Func,
    FunctionBase,
    GetMethod,
    GlobalVariable,
    InstanceMethod,
    StaticMethod,
    Struct,
    TypeAlias,
} from "@server/languages/tolk/psi/Decls"
import {asLspRange, asNullableLspRange} from "@server/utils/position"
import {ScopeProcessor} from "@server/languages/tolk/psi/Reference"
import {index, IndexKey} from "@server/languages/tolk/indexes"
import {ResolveState} from "@server/psi/ResolveState"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"

export function provideTolkDocumentSymbols(file: TolkFile): lsp.DocumentSymbol[] {
    const result: lsp.DocumentSymbol[] = []

    function symbolDetail(
        element: NamedNode | FunctionBase | Field | Constant | GlobalVariable,
    ): string {
        if (element instanceof FunctionBase) {
            return element.signaturePresentation(true)
        }
        if (element instanceof Field) {
            const type = element.typeNode()?.node.text ?? "unknown"
            return `: ${type}`
        }
        if (element instanceof EnumMember) {
            return element.defaultValuePresentation()
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
        const children = symbolChildren(element)

        return {
            name: symbolName(element),
            kind: kind,
            range: asLspRange(element.node),
            detail: detail,
            selectionRange: asNullableLspRange(element.nameIdentifier()),
            children: children,
        }
    }

    function symbolChildren(element: NamedNode): lsp.DocumentSymbol[] {
        const children: NamedNode[] = []
        const additionalChildren: lsp.DocumentSymbol[] = []

        if (element instanceof Struct) {
            children.push(...element.fields())
        }
        if (element instanceof Enum) {
            children.push(...element.members())
        }

        return [...children.map(el => createSymbol(el)), ...additionalChildren]
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
    file.getMethods().forEach(n => result.push(createSymbol(n)))
    file.getGetMethods().forEach(n => result.push(createSymbol(n)))
    file.getStructs().forEach(n => result.push(createSymbol(n)))
    file.getEnums().forEach(n => result.push(createSymbol(n)))
    file.getTypeAliases().forEach(n => result.push(createSymbol(n)))
    file.getConstants().forEach(n => result.push(createSymbol(n)))
    file.getGlobalVariables().forEach(n => result.push(createSymbol(n)))

    return result.sort((a, b) => a.range.start.line - b.range.start.line)
}

export function provideTolkWorkspaceSymbols(): lsp.WorkspaceSymbol[] {
    const result: lsp.WorkspaceSymbol[] = []

    const state = new ResolveState()
    const proc = new (class implements ScopeProcessor {
        public execute(node: TolkNode, _state: ResolveState): boolean {
            if (!(node instanceof NamedNode)) return true
            const nameIdentifier = node.nameIdentifier()
            if (!nameIdentifier) return true

            if (node instanceof Enum) {
                for (const member of node.members()) {
                    const owner = member.owner()?.name() ?? "Unknown"

                    result.push({
                        name: owner + "." + member.name(),
                        containerName: "",
                        kind: symbolKind(member),
                        location: {
                            uri: member.file.uri,
                            range: asLspRange(member.node),
                        },
                    })
                }
            }

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
    index.processElementsByKey(IndexKey.TypeAlias, proc, state)
    index.processElementsByKey(IndexKey.Funcs, proc, state)
    index.processElementsByKey(IndexKey.Methods, proc, state)
    index.processElementsByKey(IndexKey.GetMethods, proc, state)
    index.processElementsByKey(IndexKey.Structs, proc, state)
    index.processElementsByKey(IndexKey.Enums, proc, state)
    index.processElementsByKey(IndexKey.Constants, proc, state)

    return result
}

function symbolName(element: NamedNode | FunctionBase | Field | Constant | GlobalVariable): string {
    if (element instanceof InstanceMethod || element instanceof StaticMethod) {
        return element.receiverTypeString() + "." + element.name()
    }
    if (element instanceof GetMethod) {
        return "get " + element.name()
    }
    return element.name()
}

function symbolKind(node: NamedNode): lsp.SymbolKind {
    if (node instanceof Func) {
        return lsp.SymbolKind.Function
    }
    if (node instanceof StaticMethod) {
        return lsp.SymbolKind.Method
    }
    if (node instanceof InstanceMethod) {
        return lsp.SymbolKind.Method
    }
    if (node instanceof GetMethod) {
        return lsp.SymbolKind.Event
    }
    if (node instanceof Struct) {
        return lsp.SymbolKind.Struct
    }
    if (node instanceof Enum) {
        return lsp.SymbolKind.Enum
    }
    if (node instanceof TypeAlias) {
        return lsp.SymbolKind.TypeParameter
    }
    if (node instanceof Constant) {
        return lsp.SymbolKind.Constant
    }
    if (node instanceof GlobalVariable) {
        return lsp.SymbolKind.Variable
    }
    if (node instanceof Field) {
        return lsp.SymbolKind.Field
    }
    if (node instanceof EnumMember) {
        return lsp.SymbolKind.EnumMember
    }
    return lsp.SymbolKind.Object
}
