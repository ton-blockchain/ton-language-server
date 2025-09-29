import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {ContractAbi, EntryPoint, Field, GetMethod, Storage, TypeAbi} from "@shared/abi"
import {ImportResolver} from "@server/languages/tolk/psi/ImportResolver"
import {typeOf} from "@server/languages/tolk/type-inference"
import {convertTyToTypeInfo} from "./type-converter"

export function contractAbi(file: TolkFile): ContractAbi | undefined {
    const getMethods: GetMethod[] = []
    const messages: TypeAbi[] = []
    const types: TypeAbi[] = []
    let storage: Storage | undefined = undefined
    let entryPoint: EntryPoint | undefined = undefined
    let externalEntryPoint: EntryPoint | undefined = undefined

    for (const func of file.getFunctions()) {
        if (func.name() === "onInternalMessage") {
            entryPoint = {
                pos: func.nameIdentifier()?.startPosition,
            }
        }
    }
    for (const func of file.getFunctions()) {
        if (func.name() === "onExternalMessage") {
            externalEntryPoint = {
                pos: func.nameIdentifier()?.startPosition,
            }
        }
    }

    const filesToProcess = [file, ...collectImportedFiles(file)]

    for (const currentFile of filesToProcess) {
        for (const method of currentFile.getGetMethods()) {
            getMethods.push({
                name: method.name(),
                id: method.computeMethodId(),
                pos: method.nameIdentifier()?.startPosition,
            })
        }

        for (const struct of currentFile.getStructs()) {
            if (struct.name() === "Storage") {
                storage = {
                    fields: struct.fields().map((field): Field => {
                        const ty = typeOf(field.node, file)
                        return {
                            name: field.name(),
                            type: ty
                                ? convertTyToTypeInfo(ty)
                                : {name: "slice", humanReadable: "slice"},
                        }
                    }),
                }
            }

            const fields: Field[] = struct.fields().map(field => {
                const ty = typeOf(field.node, file)
                return {
                    name: field.name(),
                    type: ty ? convertTyToTypeInfo(ty) : {name: "slice", humanReadable: "slice"},
                }
            })

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

function getContractNameFromDocument(document: TolkFile): string {
    const fileName = document.name
    const baseName = fileName.split("/").pop() ?? "Unknown"
    return baseName.replace(/\.(tolk|fc|func)$/, "")
}
