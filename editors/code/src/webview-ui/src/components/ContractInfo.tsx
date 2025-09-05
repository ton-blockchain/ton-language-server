import React from "react"
import styles from "./ContractInfo.module.css"
import {Cell, loadShardAccount} from "@ton/core"

interface ContractInfoData {
    readonly account: string
}

interface Props {
    readonly info: ContractInfoData | undefined
    readonly contractAddress?: string
    readonly onSendMessage?: () => void
    readonly onCallGetMethod?: () => void
}

export const ContractInfo: React.FC<Props> = ({
    info,
    contractAddress,
    onSendMessage,
    onCallGetMethod,
}) => {
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
