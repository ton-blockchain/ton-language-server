import vscode from "vscode"
import {GetContractAbiParams, GetContractAbiResponse} from "@shared/shared-msgtypes"
import {TolkCompilerProvider} from "./TolkCompilerProvider"
import {ContractAbi} from "@shared/abi"
import {SandboxTreeProvider} from "./SandboxTreeProvider"
import {ContractInfoData} from "../webview-ui/src/types"
import {SourceMap} from "ton-source-map"

export interface OperationNode {
    readonly id: string
    readonly type: "deploy" | "send-internal" | "send-external"
    readonly timestamp: string
    readonly contractName?: string
    readonly contractAddress?: string
    readonly success: boolean
    readonly details?: string
    readonly fromContract?: string
    readonly toContract?: string
    readonly resultString?: string
}

export interface DeployState {
    readonly isValidFile: boolean
    readonly hasRequiredFunctions: boolean
    readonly fileName?: string
    readonly errorMessage?: string
}

export type DeployValidationResult = DeployState & {
    readonly abi?: ContractAbi
}

function checkRequiredFunctions(content: string): boolean {
    const hasOnInternalMessage = /fun\s+onInternalMessage\s*\(/.test(content)
    const hasMain = /fun\s+main\s*\(/.test(content)
    return hasOnInternalMessage || hasMain
}

export async function loadAndValidateAbiForDeploy(): Promise<DeployValidationResult> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        return {
            isValidFile: false,
            hasRequiredFunctions: false,
            errorMessage: "No active editor found. Please open a Tolk contract file first.",
        }
    }

    const fileName = editor.document.fileName.split("/").pop() ?? "unknown"
    const languageId = editor.document.languageId

    if (languageId !== "tolk") {
        return {
            isValidFile: false,
            hasRequiredFunctions: false,
            fileName,
            errorMessage: `Currently opened file is not a Tolk contract file (.tolk extension).`,
        }
    }

    const content = editor.document.getText()
    const hasRequiredFunctions = checkRequiredFunctions(content)

    if (!hasRequiredFunctions) {
        return {
            isValidFile: true,
            hasRequiredFunctions: false,
            fileName,
            errorMessage:
                "File is missing required entry points. Please add either 'fun onInternalMessage()' or 'fun main()' or open another file.",
        }
    }

    try {
        const abiResult: GetContractAbiResponse = await vscode.commands.executeCommand(
            "tolk.getContractAbi",
            {
                textDocument: {
                    uri: editor.document.uri.toString(),
                },
            } satisfies GetContractAbiParams,
        )

        return {
            isValidFile: true,
            hasRequiredFunctions: true,
            fileName,
            abi: abiResult.abi,
        }
    } catch (error) {
        return {
            isValidFile: true,
            hasRequiredFunctions: true,
            fileName,
            errorMessage: `Failed to extract contract ABI: ${error instanceof Error ? error.message : "Unknown compilation error"}`,
        }
    }
}

export async function loadContractInfo(address: string): Promise<{
    success: boolean
    result?: ContractInfoData
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
            result?: ContractInfoData
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
    stateInit: string, // Base64 encoded Cell
    treeProvider: SandboxTreeProvider | undefined,
    value: string,
    storageType?: string,
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

    const sourceUri = editor.document.uri.toString()
    const abiResult: GetContractAbiResponse = await vscode.commands.executeCommand(
        "tolk.getContractAbi",
        {
            textDocument: {
                uri: sourceUri,
            },
        } satisfies GetContractAbiParams,
    )

    let contractAbi = abiResult.abi

    // If we have several storage types, we request actual one from the user
    // If so, we need to update the ABI with the actual storage type for all further operations
    if (storageType && contractAbi && !contractAbi.storage) {
        const storageTypeDef = contractAbi.types.find(type => type.name === storageType)
        if (storageTypeDef) {
            contractAbi = {
                ...contractAbi,
                storage: storageTypeDef,
            }
        }
    }

    try {
        const compiler = TolkCompilerProvider.getInstance()
        const result = await compiler.compileContract(editor.document.uri)

        if (!result.success) {
            void vscode.window.showErrorMessage(`Compilation failed: ${result.error}`)
            return
        }

        if (!result.code) {
            void vscode.window.showErrorMessage("Compilation succeeded but no code generated")
            return
        }

        const deployResult = await deployContract(
            {
                code: result.code,
                data: stateInit,
            },
            name,
            value,
            sourceUri,
            result.sourceMap,
            contractAbi,
        )
        if (deployResult.success && deployResult.address) {
            const isRedeploy = treeProvider?.isContractDeployed(deployResult.address) ?? false

            treeProvider?.addDeployedContract(
                deployResult.address,
                name,
                contractAbi,
                sourceUri,
                result.sourceMap,
            )

            void vscode.commands.executeCommand("ton.sandbox.states.refresh")

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

async function deployContract(
    stateInit: {
        code: string
        data: string
    },
    name: string,
    value: string,
    sourceUri: string,
    sourceMap: SourceMap | undefined,
    abi: ContractAbi | undefined,
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
                sourceMap,
                abi,
                sourceUri,
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

export async function loadLatestOperationResult(): Promise<{
    success: boolean
    resultString?: string
    operationData?: OperationNode
    error?: string
}> {
    try {
        const config = vscode.workspace.getConfiguration("ton")
        const sandboxUrl = config.get<string>("sandbox.url", "http://localhost:3000")

        const response = await fetch(`${sandboxUrl}/operations/latest/result`, {
            method: "GET",
            headers: {"Content-Type": "application/json"},
        })

        if (!response.ok) {
            if (response.status === 404) {
                return {
                    success: false,
                    error: "No operations found",
                }
            }
            throw new Error(`API call failed: ${response.status} ${response.statusText}`)
        }

        const data = (await response.json()) as {
            operation: OperationNode
        }

        return {
            success: true,
            resultString: data.operation.resultString,
            operationData: data.operation,
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        }
    }
}

export function formatAddress(address: string): string {
    if (address.length <= 12) {
        return address
    }
    return `${address.slice(0, 6)}...${address.slice(Math.max(0, address.length - 6))}`
}
