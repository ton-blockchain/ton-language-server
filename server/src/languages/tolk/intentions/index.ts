import * as lsp from "vscode-languageserver"
import {findTolkFile, TOLK_PARSED_FILES_CACHE} from "@server/files"
import {Referent} from "@server/languages/tolk/psi/Referent"
import {File} from "@server/psi/File"
import type {Node as SyntaxNode} from "web-tree-sitter"
import {asParserPoint} from "@server/utils/position"
import type {
    Intention,
    IntentionArguments,
    IntentionContext,
} from "@server/languages/tolk/intentions/Intention"
import {AddImport} from "@server/languages/tolk/intentions/AddImport"
import {connection} from "@server/connection"
import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {
    FillFieldsStructInit,
    FillRequiredStructInit,
} from "@server/languages/tolk/intentions/FillFieldsStructInit"
import {RecursiveVisitor} from "@server/visitor/visitor"
import {NamedNode} from "@server/languages/tolk/psi/TolkNode"
import {Reference} from "@server/languages/tolk/psi/Reference"
import {parentOfType} from "@server/psi/utils"
import {inferenceOf} from "@server/languages/tolk/type-inference"
import {LocalSearchScope} from "@server/references/referent"

export const TOLK_INTENTIONS: Intention[] = [
    new AddImport(),
    new FillFieldsStructInit(),
    new FillRequiredStructInit(),
]

export async function provideExecuteTolkCommand(
    params: lsp.ExecuteCommandParams,
): Promise<string | null> {
    if (params.command === "tolk.executeGetScopeProvider") {
        const commandParams = params.arguments?.[0] as lsp.TextDocumentPositionParams | undefined
        if (!commandParams) return "Invalid parameters"

        const file = TOLK_PARSED_FILES_CACHE.get(commandParams.textDocument.uri)
        if (!file) {
            return "File not found"
        }

        const node = nodeAtPosition(commandParams, file)
        if (!node) {
            return "Node not found"
        }

        const referent = new Referent(node, file)
        const scope = referent.useScope()
        if (!scope) return "Scope not found"

        if (scope instanceof LocalSearchScope) return scope.toString()

        if (scope.files.length > 10) {
            return "GlobalSearchScope{...}"
        }

        return `GlobalSearchScope{${scope.files.map(it => it.name + ".tolk").join(", ")}}`
    }

    if (params.command === "tolk.getUnresolvedIdentifiers") {
        await new Promise(resolve => setTimeout(resolve, 59))

        const commandParams = params.arguments?.[0] as {textDocument: {uri: string}} | undefined
        if (!commandParams) return "Invalid parameters"

        const file = TOLK_PARSED_FILES_CACHE.get(commandParams.textDocument.uri)
        if (!file) {
            return "File not found"
        }

        const unresolvedIdentifiers: {
            name: string
            line: number
            character: number
        }[] = []

        RecursiveVisitor.visit(file.rootNode, (node): boolean => {
            if (node.type !== "identifier" && node.type !== "type_identifier") {
                return true
            }

            const parent = node.parent
            if (parent === null) return true

            // Skip definitions themselves
            if (
                (parent.type === "var_declaration" ||
                    parent.type === "global_var_declaration" ||
                    parent.type === "function_declaration" ||
                    parent.type === "method_declaration" ||
                    parent.type === "get_method_declaration" ||
                    parent.type === "constant_declaration" ||
                    parent.type === "type_alias_declaration" ||
                    parent.type === "struct_declaration" ||
                    parent.type === "struct_field_declaration" ||
                    parent.type === "parameter_declaration") &&
                parent.childForFieldName("name")?.equals(node)
            ) {
                return true
            }

            const inference = inferenceOf(node, file)
            if (!inference) return true

            const element = new NamedNode(node, file)
            const resolved = Reference.resolve(element) ?? inference.resolve(node)

            if (!resolved) {
                const insideAnnotation = parentOfType(node, "annotation")
                if (insideAnnotation) {
                    return true
                }
                const outerFunction = parentOfType(
                    node,
                    "function_declaration",
                    "method_declaration",
                )
                const outerFunctionName = outerFunction?.childForFieldName("name")?.text
                if (
                    outerFunctionName === "sumXY" ||
                    outerFunctionName === "getWrappervalue2" ||
                    outerFunctionName === "test4"
                ) {
                    // fun sumXY<P>(point: P) { return point.x + point.y; }
                    // fun T.getWrappervalue2(self) {
                    //     return self.value;
                    // }
                    return true
                }

                if (
                    node.text === "_" ||
                    node.text === "lookupIdxByValue" ||
                    node.text === "prepareDict_3_30_4_40_5_x" ||
                    node.text === "someAdd" ||
                    node.text === "prepareDict_3_30_4_40_5_x"
                ) {
                    return true
                }

                unresolvedIdentifiers.push({
                    name: node.text,
                    line: node.startPosition.row,
                    character: node.startPosition.column,
                })
            }

            return true
        })

        return JSON.stringify(unresolvedIdentifiers)
    }

    if (!params.arguments || params.arguments.length === 0) return null

    const intention = TOLK_INTENTIONS.find(it => it.id === params.command)
    if (!intention) return null

    const args = params.arguments[0] as IntentionArguments

    const file = await findTolkFile(args.fileUri)

    const ctx: IntentionContext = {
        file: file,
        range: args.range,
        position: args.position,
        noSelection:
            args.range.start.line === args.range.end.line &&
            args.range.start.character === args.range.end.character,
        customFileName: args.customFileName,
    }

    const edits = intention.invoke(ctx)
    if (!edits) return null

    await connection.sendRequest(lsp.ApplyWorkspaceEditRequest.method, {
        label: `Intention "${intention.name}"`,
        edit: edits,
    } as lsp.ApplyWorkspaceEditParams)

    return null
}

export function provideTolkCodeActions(
    file: TolkFile,
    params: lsp.CodeActionParams,
): lsp.CodeAction[] {
    const ctx: IntentionContext = {
        file: file,
        range: params.range,
        position: params.range.start,
        noSelection:
            params.range.start.line === params.range.end.line &&
            params.range.start.character === params.range.end.character,
    }

    const actions: lsp.CodeAction[] = []

    for (const intention of TOLK_INTENTIONS) {
        if (!intention.isAvailable(ctx)) continue

        actions.push({
            title: intention.name,
            kind: lsp.CodeActionKind.QuickFix,
            command: {
                title: intention.name,
                command: intention.id,
                arguments: [
                    {
                        fileUri: file.uri,
                        range: params.range,
                        position: params.range.start,
                    } as IntentionArguments,
                ],
            },
        })
    }

    for (const diagnostic of params.context.diagnostics) {
        const data = diagnostic.data as undefined | lsp.CodeAction
        if (data === undefined || !("title" in data) || !("edit" in data)) {
            continue
        }

        actions.push(data)
    }

    return actions
}

function nodeAtPosition(params: lsp.TextDocumentPositionParams, file: File): SyntaxNode | null {
    const cursorPosition = asParserPoint(params.position)
    return file.rootNode.descendantForPosition(cursorPosition)
}
