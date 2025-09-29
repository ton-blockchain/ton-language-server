import React, {useMemo} from "react"
import styles from "./ContractInfo.module.css"
import {Cell, loadShardAccount} from "@ton/core"
import {ContractAbi} from "@shared/abi"
import {ContractInfoData, VSCodeAPI} from "../types"
import {VscEdit, VscFileCode, VscTrash} from "react-icons/vsc"
import {DeployedContract} from "../../../providers/lib/contract"

interface Props {
    readonly info: ContractInfoData | undefined
    readonly contractAddress?: string
    readonly contracts?: DeployedContract[]
    readonly onSendMessage?: () => void
    readonly onCallGetMethod?: () => void
    readonly vscode: VSCodeAPI
}

function parseStorageData(abi: ContractAbi, dataBase64: string): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    try {
        const dataCell = Cell.fromBase64(dataBase64)
        const parser = dataCell.beginParse()

        const storageAbi = abi.storage
        if (storageAbi?.fields) {
            for (const field of storageAbi.fields) {
                try {
                    const fieldType = field.type.humanReadable.toLowerCase()

                    if (fieldType === "bool") {
                        result[field.name] = parser.loadBit() ? "true" : "false"
                    } else if (fieldType.startsWith("uint")) {
                        const bitsMatch = /uint(\d+)/.exec(fieldType)
                        if (bitsMatch) {
                            const bits = Number.parseInt(bitsMatch[1])
                            if (bits <= 32) {
                                result[field.name] = parser.loadUint(bits).toString()
                            } else {
                                // Для больших значений используем последовательное чтение
                                let value = 0n
                                for (let i = 0; i < Math.ceil(bits / 32); i++) {
                                    const chunkBits = Math.min(32, bits - i * 32)
                                    const chunk = parser.loadUint(chunkBits)
                                    value |= BigInt(chunk) << BigInt(i * 32)
                                }
                                result[field.name] = value.toString()
                            }
                        } else {
                            // Для uint без размера используем 256 бит
                            let value = 0n
                            for (let i = 0; i < 8; i++) {
                                const chunk = parser.loadUint(32)
                                value |= BigInt(chunk) << BigInt(i * 32)
                            }
                            result[field.name] = value.toString()
                        }
                    } else if (fieldType.startsWith("int")) {
                        const bitsMatch = /int(\d+)/.exec(fieldType)
                        if (bitsMatch) {
                            const bits = Number.parseInt(bitsMatch[1])
                            if (bits <= 32) {
                                result[field.name] = parser.loadInt(bits).toString()
                            } else {
                                // Для больших значений используем последовательное чтение
                                let value = 0n
                                for (let i = 0; i < Math.ceil(bits / 32); i++) {
                                    const chunkBits = Math.min(32, bits - i * 32)
                                    const chunk = parser.loadUint(chunkBits)
                                    value |= BigInt(chunk) << BigInt(i * 32)
                                }
                                // Обработка знака для отрицательных чисел
                                if (bits > 0 && (value & (1n << BigInt(bits - 1))) !== 0n) {
                                    value -= 1n << BigInt(bits)
                                }
                                result[field.name] = value.toString()
                            }
                        } else {
                            // Для int без размера используем 257 бит
                            let value = 0n
                            for (let i = 0; i < 9; i++) {
                                const chunkBits = i === 8 ? 1 : 32
                                const chunk = parser.loadUint(chunkBits)
                                value |= BigInt(chunk) << BigInt(i * 32)
                            }
                            result[field.name] = value.toString()
                        }
                    } else if (fieldType.startsWith("varuint")) {
                        const bitsMatch = /varuint(\d+)/.exec(fieldType)
                        if (bitsMatch) {
                            const maxBits = Number.parseInt(bitsMatch[1])
                            const maxBytes = Math.ceil(maxBits / 8)
                            result[field.name] = parser.loadVarUintBig(maxBytes).toString()
                        } else {
                            result[field.name] = parser.loadVarUintBig(16).toString()
                        }
                    } else if (fieldType.startsWith("varint")) {
                        const bitsMatch = /varint(\d+)/.exec(fieldType)
                        if (bitsMatch) {
                            const maxBits = Number.parseInt(bitsMatch[1])
                            const maxBytes = Math.ceil(maxBits / 8)
                            result[field.name] = parser.loadVarIntBig(maxBytes).toString()
                        } else {
                            result[field.name] = parser.loadVarIntBig(16).toString()
                        }
                    } else if (fieldType === "cell") {
                        const cell = parser.loadRef()
                        result[field.name] = cell.toBoc().toString("base64")
                    } else if (fieldType === "address") {
                        result[field.name] = parser.loadAddress().toString()
                    } else {
                        // Неизвестный тип
                        result[field.name] = "Unknown type: " + field.type.humanReadable
                    }
                } catch (error) {
                    result[field.name] =
                        "Parse error: " + (error instanceof Error ? error.message : "Unknown")
                }
            }
        }
    } catch (error) {
        console.warn("Failed to parse storage data:", error)
    }

    return result
}

export const ContractInfo: React.FC<Props> = ({
    info,
    contractAddress,
    contracts = [],
    onSendMessage,
    onCallGetMethod,
    vscode,
}) => {
    const contractName = useMemo(() => {
        if (!contractAddress || contracts.length === 0) return null
        const contract = contracts.find(c => c.address === contractAddress)
        return contract?.name ?? null
    }, [contractAddress, contracts])

    const handleRenameContract = (): void => {
        if (!contractAddress || !contractName) return

        vscode.postMessage({
            type: "renameContract",
            contractAddress,
            newName: contractName,
        })
    }

    const handleDeleteContract = (): void => {
        if (!contractAddress) return

        vscode.postMessage({
            type: "deleteContract",
            contractAddress,
        })
    }

    const storageFields = useMemo(() => {
        if (info?.abi && info.account) {
            const account = loadShardAccount(Cell.fromHex(info.account).beginParse())
            const state = account.account?.storage.state
            if (state?.type === "active" && state.state.data) {
                return parseStorageData(info.abi, state.state.data.toBoc().toString("base64"))
            }
        }
        return {}
    }, [info?.abi, info?.stateInit?.data])

    if (!info) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className={styles.loadingSpinner}></div>
                    <div className={styles.loadingText}>Loading contract information...</div>
                </div>
            </div>
        )
    }

    try {
        const account = loadShardAccount(Cell.fromHex(info.account).beginParse())
        const balance = account.account?.storage.balance.coins.toString() ?? "0"
        const stateType = account.account?.storage.state.type
        const isActive = stateType === "active"
        const isFrozen = stateType === "frozen"

        const formatAddress = (address: string): string => {
            if (address.length <= 12) return address
            return `${address.slice(0, 6)}...${address.slice(-6)}`
        }

        const formatBalance = (coins: string): string => {
            const tonAmount = Number(coins) / 1e9
            return `${tonAmount.toFixed(4)} TON`
        }

        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.contractTitle}>
                            <span className={styles.contractName}>
                                {contractName ?? "Unknown Contract"}
                            </span>
                            {contractAddress && (
                                <span
                                    className={styles.contractNameValue}
                                    title={contractAddress}
                                    onClick={() => {
                                        navigator.clipboard
                                            .writeText(contractAddress)
                                            .catch(console.error)
                                    }}
                                >
                                    {formatAddress(contractAddress)}
                                </span>
                            )}
                        </div>
                        <div
                            className={`${styles.contractStatus} ${
                                isActive
                                    ? styles.active
                                    : isFrozen
                                      ? styles.frozen
                                      : styles.inactive
                            }`}
                        >
                            <span className={styles.statusDot}></span>
                            <span className={styles.statusText}>
                                {isActive ? "Active" : isFrozen ? "Frozen" : "Inactive"}
                            </span>
                        </div>
                        <div className={styles.contractBalance}>
                            <span className={styles.balanceText}>{formatBalance(balance)}</span>
                        </div>
                    </div>

                    {contractName !== "treasury" && (
                        <div className={styles.headerActions}>
                            <button
                                className={styles.headerActionButton}
                                title="Rename contract"
                                onClick={handleRenameContract}
                            >
                                <VscEdit size={14} />
                            </button>
                            <button
                                className={styles.headerActionButton}
                                title="Open contract source"
                                onClick={() => {
                                    if (info.sourceUri) {
                                        vscode.postMessage({
                                            type: "openContractSource",
                                            sourceUri: info.sourceUri,
                                        })
                                    }
                                }}
                                disabled={!info.sourceUri}
                            >
                                <VscFileCode size={14} />
                            </button>
                            <button
                                className={`${styles.headerActionButton} ${styles.deleteButton}`}
                                title="Delete contract"
                                onClick={handleDeleteContract}
                            >
                                <VscTrash size={14} />
                            </button>
                        </div>
                    )}
                </div>

                {Object.keys(storageFields).length > 0 && (
                    <div className={styles.storageSection}>
                        <div className={styles.sectionTitle}>Storage</div>
                        <div className={styles.storageGrid}>
                            {Object.entries(storageFields).map(([fieldName, fieldValue]) => (
                                <div key={fieldName} className={styles.storageItem}>
                                    <span className={styles.fieldName}>{fieldName}:</span>
                                    <span className={styles.fieldValue} title={String(fieldValue)}>
                                        {typeof fieldValue === "boolean"
                                            ? fieldValue
                                                ? "true"
                                                : "false"
                                            : typeof fieldValue === "string" &&
                                                fieldValue.startsWith("Parse error")
                                              ? "❌ " + fieldValue
                                              : String(fieldValue).length > 20
                                                ? String(fieldValue).slice(0, 20) + "..."
                                                : String(fieldValue)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className={styles.actions}>
                    <button
                        className={styles.actionButton}
                        onClick={onSendMessage}
                        disabled={!onSendMessage}
                    >
                        Send Message
                    </button>
                    <button
                        className={styles.actionButton}
                        onClick={onCallGetMethod}
                        disabled={!onCallGetMethod}
                    >
                        Call Get Method
                    </button>
                </div>
            </div>
        )
    } catch (error) {
        return (
            <div className={styles.container}>
                <div className={styles.error}>
                    <div className={styles.errorIcon}>⚠️</div>
                    <div className={styles.errorText}>Failed to load contract information</div>
                    <div className={styles.errorDetails}>
                        {error instanceof Error ? error.message : "Unknown error"}
                    </div>
                </div>
            </div>
        )
    }
}
