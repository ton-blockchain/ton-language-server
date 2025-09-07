import vscode from "vscode"
import {GetContractAbiParams, GetContractAbiResponse} from "@shared/shared-msgtypes"
import {TolkCompilerProvider} from "./TolkCompilerProvider"
import {ContractAbi, Field} from "@shared/abi"
import {beginCell} from "@ton/core"
import {SandboxTreeProvider} from "./SandboxTreeProvider"

export async function loadContractAbiForDeploy(): Promise<ContractAbi | undefined> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        void vscode.window.showErrorMessage("No active editor with contract code")
        return undefined
    }

    if (editor.document.languageId !== "tolk") {
        void vscode.window.showErrorMessage("Active file is not a Tolk contract")
        return undefined
    }

    const abiResult: GetContractAbiResponse = await vscode.commands.executeCommand(
        "tolk.getContractAbi",
        {
            textDocument: {
                uri: editor.document.uri.toString(),
            },
        } satisfies GetContractAbiParams,
    )

    return abiResult.abi
}

export async function loadContractInfo(address: string): Promise<{
    success: boolean
    result?: {account: string}
    error?: string
}> {
    try {
        const config = vscode.workspace.getConfiguration("ton")
        const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

        const response = await fetch(`${sandboxUrl}/info`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                address,
            }),
        })

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`)
        }

        return (await response.json()) as {
            success: boolean
            result?: {account: string}
            error?: string
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export async function compileAndDeployFromEditor(
    name: string,
    storageFields: Record<string, string>,
    treeProvider: SandboxTreeProvider | undefined,
    value?: string,
): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        void vscode.window.showErrorMessage("No active editor with contract code")
        return
    }

    if (editor.document.languageId !== "tolk") {
        void vscode.window.showErrorMessage("Active file is not a Tolk contract")
        return
    }

    const abiResult: GetContractAbiResponse = await vscode.commands.executeCommand(
        "tolk.getContractAbi",
        {
            textDocument: {
                uri: editor.document.uri.toString(),
            },
        } satisfies GetContractAbiParams,
    )

    const contractAbi = abiResult.abi

    try {
        const compiler = TolkCompilerProvider.getInstance()
        const result = await compiler.compileContract(editor.document.getText())

        if (!result.success) {
            void vscode.window.showErrorMessage(`Compilation failed: ${result.error}`)
            return
        }

        if (!result.code) {
            void vscode.window.showErrorMessage("Compilation succeeded but no code generated")
            return
        }

        let initialData: string | undefined
        if (contractAbi?.storage?.fields && Object.keys(storageFields).length > 0) {
            try {
                initialData = await buildInitialData(contractAbi.storage.fields, storageFields)
            } catch (error) {
                void vscode.window.showErrorMessage(
                    `Failed to build initial data: ${error instanceof Error ? error.message : "Unknown error"}`,
                )
                return
            }
        }

        const deployResult = await deployContract(
            {
                code: result.code,
                data: initialData ?? "",
            },
            name,
            value,
        )
        if (deployResult.success && deployResult.address) {
            const contractName = getContractNameFromDocument(editor.document)
            const isRedeploy = treeProvider?.isContractDeployed(deployResult.address) ?? false

            treeProvider?.addDeployedContract(deployResult.address, contractName, contractAbi)

            const message = isRedeploy
                ? `Contract redeployed successfully! Address: ${formatAddress(deployResult.address)}`
                : `Contract deployed successfully! Address: ${formatAddress(deployResult.address)}`

            void vscode.window.showInformationMessage(message)
        } else {
            void vscode.window.showErrorMessage(`Deploy failed: ${deployResult.error}`)
        }
    } catch (error) {
        void vscode.window.showErrorMessage(
            `Operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
    }
}

function getContractNameFromDocument(document: vscode.TextDocument): string {
    const fileName = document.fileName
    const baseName = fileName.split("/").pop() ?? "Unknown"
    return baseName.replace(/\.(tolk|fc|func)$/, "")
}

async function deployContract(
    stateInit: {
        code: string
        data: string
    },
    name: string,
    value?: string,
): Promise<{
    success: boolean
    address?: string
    error?: string
}> {
    try {
        const config = vscode.workspace.getConfiguration("ton")
        const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

        const response = await fetch(`${sandboxUrl}/deploy`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                stateInit,
                value,
                name,
            }),
        })

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`)
        }

        return (await response.json()) as {success: boolean; address?: string; error?: string}
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

async function buildInitialData(
    storageFields: readonly Field[],
    fieldValues: Record<string, string>,
): Promise<string> {
    const builder = beginCell()

    for (const field of storageFields) {
        const fieldValue = fieldValues[field.name]
        if (!fieldValue) {
            continue
        }

        const fieldTypeInfo = parseFieldTypeFromAbi(field.type)
        if (!fieldTypeInfo) {
            continue
        }

        try {
            switch (fieldTypeInfo.type) {
                case "uint": {
                    const value = BigInt(fieldValue)
                    builder.storeUint(value, fieldTypeInfo.bits)
                    break
                }
                case "int": {
                    const value = BigInt(fieldValue)
                    builder.storeInt(value, fieldTypeInfo.bits)
                    break
                }
                case "bool": {
                    const value = fieldValue.toLowerCase() === "true" || fieldValue === "1"
                    builder.storeBit(value)
                    break
                }
                case "varuint": {
                    const value = BigInt(fieldValue)
                    builder.storeVarUint(value, fieldTypeInfo.maxBytes)
                    break
                }
                case "varint": {
                    const value = BigInt(fieldValue)
                    builder.storeVarInt(value, fieldTypeInfo.maxBytes)
                    break
                }
                case "cell": {
                    const {Cell} = await import("@ton/core")
                    const cellValue = Cell.fromBase64(fieldValue)
                    builder.storeRef(cellValue)
                    break
                }
                default: {
                    // TODO
                    break
                }
            }
        } catch (error) {
            throw new Error(
                `Failed to encode storage field ${field.name} (${field.type}) with value ${fieldValue}: ${error instanceof Error ? error.message : "Unknown error"}`,
            )
        }
    }

    const cell = builder.endCell()
    return cell.toBoc().toString("base64")
}

function parseFieldTypeFromAbi(abiType: string):
    | {
          type: string
          bits: number
          maxBytes: number
      }
    | undefined {
    const lowerAbiType = abiType.toLowerCase()

    if (lowerAbiType === "bool") {
        return {type: "bool", bits: 1, maxBytes: 1}
    }

    const uintMatch = /^uint(\d+)$/.exec(lowerAbiType)
    if (uintMatch) {
        const bits = Number.parseInt(uintMatch[1], 10)
        return {type: "uint", bits, maxBytes: 0}
    }

    const intMatch = /^int(\d+)$/.exec(lowerAbiType)
    if (intMatch) {
        const bits = Number.parseInt(intMatch[1], 10)
        return {type: "int", bits, maxBytes: 0}
    }

    const varuintMatch = /^varuint(\d+)$/.exec(lowerAbiType)
    if (varuintMatch) {
        const maxBits = Number.parseInt(varuintMatch[1], 10)
        const maxBytes = Math.ceil(maxBits / 8)
        return {type: "varuint", bits: 0, maxBytes}
    }

    const varintMatch = /^varint(\d+)$/.exec(lowerAbiType)
    if (varintMatch) {
        const maxBits = Number.parseInt(varintMatch[1], 10)
        const maxBytes = Math.ceil(maxBits / 8)
        return {type: "varint", bits: 0, maxBytes}
    }

    if (lowerAbiType === "cell") {
        return {type: "cell", bits: 0, maxBytes: 0}
    }

    return undefined
}

export function formatAddress(address: string): string {
    if (address.length <= 12) {
        return address
    }
    return `${address.slice(0, 6)}...${address.slice(Math.max(0, address.length - 6))}`
}
