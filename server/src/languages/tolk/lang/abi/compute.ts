import {TolkFile} from "@server/languages/tolk/psi/TolkFile"
import {ContractAbi, EntryPoint, GetMethod, Message, Storage} from "@shared/abi"

export function contractAbi(file: TolkFile): ContractAbi | undefined {
    const getMethods: GetMethod[] = []
    const messages: Message[] = []
    let storage: Storage | undefined = undefined
    let entryPoint: EntryPoint | undefined = undefined

    file.getFunctions().forEach(func => {
        if (func.name() === "onInternalMessage") {
            entryPoint = {
                pos: func.nameIdentifier()?.startPosition,
            }
        }
    })

    file.getGetMethods().forEach(method => {
        getMethods.push({
            name: method.name(),
            id: method.computeMethodId(),
            pos: method.nameIdentifier()?.startPosition,
        })
    })

    file.getStructs().forEach(struct => {
        if (struct.name() === "Storage") {
            storage = {
                fields: struct.fields().map(field => {
                    return {
                        name: field.name(),
                        type: field.typeNode()?.node.text ?? "",
                    }
                }),
            }
            return
        }

        const packPrefixNode = struct.packPrefix()
        if (!packPrefixNode) return

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

        messages.push({
            name: struct.name(),
            opcode: Number(packPrefix),
            opcodeWidth: prefixLen,
            fields: struct.fields().map(field => {
                return {
                    name: field.name(),
                    type: field.typeNode()?.node.text ?? "",
                }
            }),
        })
    })

    return {
        name: getContractNameFromDocument(file),
        entryPoint,
        storage,
        getMethods,
        messages,
    }
}

function getContractNameFromDocument(document: TolkFile): string {
    const fileName = document.name
    const baseName = fileName.split("/").pop() ?? "Unknown"
    return baseName.replace(/\.(tolk|fc|func)$/, "")
}
