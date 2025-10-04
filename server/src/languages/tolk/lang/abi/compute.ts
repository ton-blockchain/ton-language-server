import type {Node as SyntaxNode} from "web-tree-sitter"

import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {ContractAbi, EntryPoint, Field, GetMethod, TypeAbi, ExitCodeInfo, Pos} from "@shared/abi"
import {ImportResolver} from "@server/languages/tolk/psi/ImportResolver"
import {typeOf} from "@server/languages/tolk/type-inference"
import {RecursiveVisitor} from "@server/visitor/visitor"

import {VoidTy} from "@server/languages/tolk/types/ty"

import {Constant} from "@server/languages/tolk/psi/Decls"

import {convertTyToTypeInfo} from "./type-converter"

export function contractAbi(file: TolkFile): ContractAbi | undefined {
    const getMethods: GetMethod[] = []
    const messages: TypeAbi[] = []
    const types: TypeAbi[] = []
    const exitCodes: ExitCodeInfo[] = []
    let storage: TypeAbi | undefined = undefined
    let entryPoint: EntryPoint | undefined = undefined
    let externalEntryPoint: EntryPoint | undefined = undefined

    for (const func of file.getFunctions()) {
        if (func.name() === "onInternalMessage") {
            const nameIdentifier = func.nameIdentifier()
            if (nameIdentifier) {
                entryPoint = {
                    pos: {
                        row: nameIdentifier.startPosition.row,
                        column: nameIdentifier.startPosition.column,
                        uri: file.uri,
                    },
                }
            }
        }
    }
    for (const func of file.getFunctions()) {
        if (func.name() === "onExternalMessage") {
            const nameIdentifier = func.nameIdentifier()
            if (nameIdentifier) {
                externalEntryPoint = {
                    pos: {
                        row: nameIdentifier.startPosition.row,
                        column: nameIdentifier.startPosition.column,
                        uri: file.uri,
                    },
                }
            }
        }
    }

    const filesToProcess = [file, ...collectImportedFiles(file)]

    collectExitCodes(filesToProcess, exitCodes)

    for (const currentFile of filesToProcess) {
        for (const method of currentFile.getGetMethods()) {
            const returnType = method.returnType()
            const returnTy = returnType ? typeOf(returnType.node, file) : null

            const parameters: Field[] = method.parameters().map(param => {
                const paramTy = typeOf(param.node, file)
                return {
                    name: param.name(),
                    type: paramTy
                        ? convertTyToTypeInfo(paramTy)
                        : {name: "slice", humanReadable: "slice"},
                }
            })

            const nameIdentifier = method.nameIdentifier()
            getMethods.push({
                name: method.name(),
                id: method.computeMethodId(),
                pos: nameIdentifier
                    ? {
                          row: nameIdentifier.startPosition.row,
                          column: nameIdentifier.startPosition.column,
                          uri: currentFile.uri,
                      }
                    : undefined,
                returnType: convertTyToTypeInfo(returnTy ?? VoidTy.VOID),
                parameters,
            })
        }

        for (const struct of currentFile.getStructs()) {
            const fields: Field[] = struct.fields().map(field => {
                const ty = typeOf(field.node, file)
                return {
                    name: field.name(),
                    type: ty ? convertTyToTypeInfo(ty) : {name: "slice", humanReadable: "slice"},
                }
            })

            if (struct.name() === "Storage") {
                storage = {
                    name: struct.name(),
                    opcode: undefined,
                    opcodeWidth: undefined,
                    fields,
                }
            }

            const packPrefixNode = struct.packPrefix()
            if (!packPrefixNode) {
                types.push({
                    name: struct.name(),
                    opcode: undefined,
                    opcodeWidth: undefined,
                    fields,
                })
                continue
            }

            const prefixStr = packPrefixNode.text
            const packPrefix = BigInt(prefixStr)
            let prefixLen = 0
            if (packPrefix >= 0) {
                prefixLen = packPrefix.toString(2).length
                if (prefixStr.startsWith("0x")) {
                    prefixLen = (prefixStr.length - 2) * 4
                } else if (prefixStr.startsWith("0b")) {
                    prefixLen = prefixStr.length - 2
                }
            }

            const type: TypeAbi = {
                name: struct.name(),
                opcode: Number(packPrefix),
                opcodeWidth: prefixLen,
                fields,
            }

            messages.push(type)
            types.push(type)
        }
    }

    return {
        name: getContractNameFromDocument(file),
        entryPoint,
        externalEntryPoint,
        storage,
        getMethods,
        messages,
        types,
        exitCodes,
    }
}

export function collectImportedFiles(file: TolkFile): TolkFile[] {
    const queue: TolkFile[] = [file]
    const result: Set<TolkFile> = new Set()

    while (queue.length > 0) {
        const current = queue.shift()
        if (!current) break

        if (result.has(current)) continue // already processed

        const importNodes = current.imports()
        for (const imp of importNodes) {
            const pathNode = imp.childForFieldName("path")
            if (!pathNode) continue
            const importedFile = ImportResolver.resolveAsFile(file, pathNode)
            if (!importedFile) continue

            result.add(importedFile)
            queue.push(importedFile)
        }
    }

    return [...result.values()]
}

function collectExitCodes(files: TolkFile[], exitCodes: ExitCodeInfo[]): void {
    const constantMap: Map<string, number> = new Map()

    for (const file of files) {
        for (const constant of file.getConstants()) {
            const value = extractConstantValue(constant)
            if (value !== undefined) {
                constantMap.set(constant.name(), value)
            }
        }
    }

    for (const file of files) {
        RecursiveVisitor.visit(file.rootNode, node => {
            if (node.type === "assert_statement" || node.type === "throw_statement") {
                const throwNode = node.childForFieldName("excNo")
                if (!throwNode) {
                    return true
                }
                const exitCodeInfo = extractThrowCode(throwNode, constantMap, file.uri)
                if (!exitCodeInfo) {
                    return true
                }
                const existing = exitCodes.find(ec => ec.constantName === exitCodeInfo.constantName)
                if (existing) {
                    existing.usagePositions.push(exitCodeInfo.usagePosition)
                } else {
                    exitCodes.push({
                        constantName: exitCodeInfo.constantName,
                        value: exitCodeInfo.value,
                        usagePositions: [exitCodeInfo.usagePosition],
                    })
                }
                return true
            }
            return true
        })
    }
}

function extractConstantValue(constant: Constant): number | undefined {
    const node = constant.node
    const valueNode = node.childForFieldName("value")
    if (valueNode?.type === "number_literal") {
        const value = Number.parseInt(valueNode.text)
        return Number.isNaN(value) ? undefined : value
    }
    return undefined
}

function extractThrowCode(
    throwNode: SyntaxNode,
    constantMap: Map<string, number>,
    fileUri: string,
): {constantName: string; value: number; usagePosition: Pos} | undefined {
    if (throwNode.type === "identifier") {
        const constantName = throwNode.text
        const value = constantMap.get(constantName)
        if (value !== undefined) {
            return {
                constantName,
                value,
                usagePosition: {
                    row: throwNode.startPosition.row,
                    column: throwNode.startPosition.column,
                    uri: fileUri,
                },
            }
        }
    }

    return undefined
}

function getContractNameFromDocument(document: TolkFile): string {
    const fileName = document.name
    const baseName = fileName.split("/").pop() ?? "Unknown"
    return baseName.replace(/\.(tolk|fc|func)$/, "")
}
