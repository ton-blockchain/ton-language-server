import React, {useMemo} from "react"
import styles from "./ContractInfo.module.css"
import {Cell, loadShardAccount} from "@ton/core"
import {ContractAbi} from "@shared/abi"
import {ContractInfoData} from "../types"

interface Props {
    readonly info: ContractInfoData | undefined
    readonly contractAddress?: string
    readonly onSendMessage?: () => void
    readonly onCallGetMethod?: () => void
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
                    const fieldType = field.type.toLowerCase()

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
                        result[field.name] = "Unknown type: " + field.type
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
    onSendMessage,
    onCallGetMethod,
}) => {
    const storageFields = useMemo(() => {
        if (info?.abi && info.stateInit?.data) {
            return parseStorageData(info.abi, info.stateInit.data)
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
        const isActive = account.account?.storage.state.type === "active"
        const codeHash =
            account.account?.storage.state.type === "active"
                ? account.account.storage.state.state.code?.hash().toString("hex")
                : undefined

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
                    {contractAddress && (
                        <div className={styles.address}>
                            <span className={styles.addressLabel}>Address:</span>
                            <span className={styles.addressValue} title={contractAddress}>
                                {formatAddress(contractAddress)}
                            </span>
                        </div>
                    )}
                </div>

                <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                        <span className={styles.label}>Status:</span>
                        <span
                            className={`${styles.status} ${isActive ? styles.active : styles.inactive}`}
                        >
                            {isActive ? "Active" : "Inactive"}
                        </span>
                    </div>

                    <div className={styles.infoItem}>
                        <span className={styles.label}>Balance:</span>
                        <span className={styles.balance}>{formatBalance(balance)}</span>
                    </div>

                    {codeHash && (
                        <div className={styles.infoItem}>
                            <span className={styles.label}>Code Hash:</span>
                            <span className={styles.codeHash} title={codeHash}>
                                {formatAddress(codeHash)}
                            </span>
                        </div>
                    )}

                    <div className={styles.infoItem}>
                        <span className={styles.label}>Last Transaction:</span>
                        <span className={styles.lastTx}>
                            {account.account?.storage.lastTransLt.toString() ?? "N/A"}
                        </span>
                    </div>
                </div>

                {Object.keys(storageFields).length > 0 && (
                    <div className={styles.storageSection}>
                        <div className={styles.sectionTitle}>Storage Fields</div>
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
