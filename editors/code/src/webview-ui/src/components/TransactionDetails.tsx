import React, {JSX, useEffect, useState} from "react"
import styles from "./TransactionDetails.module.css"

interface LocalTransactionDetails {
    readonly contractAddress: string
    readonly methodName: string
    readonly transactionId?: string
    readonly timestamp: string
    readonly status: "success" | "pending" | "failed"
}

interface Message {
    readonly type: "updateTransactionDetails"
    readonly transaction: LocalTransactionDetails
}

interface Props {
    readonly vscode: {
        readonly postMessage: (message: unknown) => void
    }
}

export default function TransactionDetails({vscode}: Props): JSX.Element {
    const [transaction, setTransaction] = useState<LocalTransactionDetails | null>(null)

    useEffect(() => {
        const handleMessage = (event: MessageEvent<Message>): void => {
            const message = event.data
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (message.type === "updateTransactionDetails") {
                setTransaction(message.transaction)
            }
            // Other message types can be handled here
        }

        window.addEventListener("message", handleMessage)
        return () => {
            window.removeEventListener("message", handleMessage)
        }
    }, [])

    if (!transaction) {
        return (
            <div className={styles.loading}>
                <div className={styles.loadingIcon}>📋</div>
                <div>Waiting for transaction details...</div>
            </div>
        )
    }

    const getStatusIcon = (status: string): string => {
        switch (status) {
            case "success": {
                return "✅"
            }
            case "pending": {
                return "⏳"
            }
            case "failed": {
                return "❌"
            }
            default: {
                return "❓"
            }
        }
    }

    const getStatusClass = (status: string): string => {
        switch (status) {
            case "success": {
                return styles.statusSuccess
            }
            case "pending": {
                return styles.statusPending
            }
            case "failed": {
                return styles.statusFailed
            }
            default: {
                return ""
            }
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Transaction Details</h2>
                <div className={styles.status}>
                    <span>{getStatusIcon(transaction.status)}</span>
                    <span className={getStatusClass(transaction.status)}>
                        {transaction.status === "success" && "Success"}
                        {transaction.status === "pending" && "Processing"}
                        {transaction.status === "failed" && "Error"}
                    </span>
                </div>
            </div>

            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <span className={styles.label}>Contract Address:</span>
                </div>
                <div className={styles.contractAddress}>{transaction.contractAddress}</div>
            </div>

            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <span className={styles.label}>Method:</span>
                </div>
                <div className={styles.methodName}>{transaction.methodName}</div>
            </div>

            {transaction.transactionId && (
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <span className={styles.label}>Transaction ID:</span>
                    </div>
                    <div className={styles.transactionId}>{transaction.transactionId}</div>
                </div>
            )}

            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <span className={styles.label}>Time:</span>
                </div>
                <div className={styles.timestamp}>
                    {new Date(transaction.timestamp).toLocaleString()}
                </div>
            </div>
        </div>
    )
}
