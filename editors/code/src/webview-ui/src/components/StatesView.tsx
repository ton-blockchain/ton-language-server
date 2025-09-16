import React, {useState, useEffect} from "react"
import styles from "./StatesView.module.css"
import {StatesVSCodeAPI} from "../states-types"

export interface OperationNode {
    readonly id: string
    readonly type: "deploy" | "send-internal" | "send-external"
    readonly timestamp: string
    readonly contractName?: string
    readonly contractAddress?: string
    readonly success: boolean
    readonly details?: string
    readonly fromContract?: {
        readonly name?: string
        readonly address: string
    }
    readonly toContract?: {
        readonly name?: string
        readonly address: string
    }
    readonly resultString?: string
}

interface Props {
    readonly operations: OperationNode[]
    readonly onLoadOperations: () => void
    readonly isLoading?: boolean
    readonly vscode: StatesVSCodeAPI
}

export const StatesView: React.FC<Props> = ({
    operations,
    onLoadOperations,
    isLoading = false,
    vscode,
}) => {
    const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set())

    useEffect(() => {
        onLoadOperations()
    }, [onLoadOperations])

    const toggleDetails = (nodeId: string): void => {
        const newExpanded = new Set(expandedDetails)
        if (newExpanded.has(nodeId)) {
            newExpanded.delete(nodeId)
        } else {
            newExpanded.add(nodeId)
        }
        setExpandedDetails(newExpanded)
    }

    const formatContractName = (nameOrAddress: string): string => {
        if (nameOrAddress === "treasury") {
            return "treasury"
        }

        if (!nameOrAddress.startsWith("EQ") && !nameOrAddress.startsWith("UQ")) {
            return nameOrAddress
        }

        return `${nameOrAddress.slice(0, 3)}...${nameOrAddress.slice(-3)}`
    }

    const renderNode = (node: OperationNode): React.JSX.Element => {
        const isDetailsExpanded = expandedDetails.has(node.id)

        return (
            <div key={node.id} className={styles.nodeContainer}>
                <div
                    className={`${styles.node} ${styles.compact} ${isDetailsExpanded ? styles.expanded : ""}`}
                    onClick={() => {
                        toggleDetails(node.id)
                    }}
                    tabIndex={0}
                    onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            toggleDetails(node.id)
                        }
                    }}
                >
                    <div className={styles.compactContent}>
                        {node.type === "send-internal" ? (
                            <>
                                <span className={styles.contractName}>
                                    {formatContractName(
                                        node.fromContract?.name ?? node.fromContract?.address ?? "",
                                    )}
                                </span>
                                <span className={styles.label}> → </span>
                                <span className={styles.contractName}>
                                    {formatContractName(
                                        node.toContract?.name ?? node.toContract?.address ?? "",
                                    )}
                                </span>
                            </>
                        ) : node.contractName ? (
                            <>
                                {node.type === "deploy" && (
                                    <span className={styles.label}>Deploy </span>
                                )}
                                <span className={styles.contractName}>
                                    {formatContractName(node.contractName)}
                                </span>
                            </>
                        ) : null}

                        <span className={styles.timestamp}>
                            <button
                                className={styles.debugButton}
                                title="Debug transaction"
                                onClick={e => {
                                    e.stopPropagation()
                                    vscode.postMessage({
                                        type: "debugTransaction",
                                        operationId: node.id,
                                    })
                                }}
                            >
                                🐛
                            </button>
                            <button
                                className={styles.detailsButton}
                                title="View transaction details"
                                onClick={e => {
                                    e.stopPropagation()
                                    vscode.postMessage({
                                        type: "showTransactionDetails",
                                        contractAddress:
                                            node.contractAddress ??
                                            node.fromContract?.address ??
                                            node.toContract?.address ??
                                            "",
                                        methodName: node.details ?? "transaction",
                                        transactionId: node.id,
                                        timestamp: node.timestamp,
                                        resultString: node.resultString,
                                    })
                                }}
                            >
                                ⓘ
                            </button>
                            {new Date(node.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </span>
                    </div>

                    <button
                        className={styles.restoreButton}
                        title="Restore blockchain state to before this event"
                        onClick={e => {
                            e.stopPropagation()
                            vscode.postMessage({
                                type: "restoreState",
                                eventId: node.id,
                            })
                        }}
                    >
                        ⟲
                    </button>
                </div>

                {isDetailsExpanded && (
                    <div className={styles.detailsExpanded}>
                        <div className={styles.details}>{node.details}</div>
                        {node.contractAddress && (
                            <div className={styles.address}>{node.contractAddress}</div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className={styles.container}>
            {isLoading ? (
                <div className={styles.loading}>Loading operation history...</div>
            ) : operations.length === 0 ? (
                <div className={styles.empty}>
                    <p>No operations found.</p>
                    <p>
                        Perform some actions like deploying contracts or sending messages to see the
                        history.
                    </p>
                </div>
            ) : (
                <div className={styles.timeline}>
                    <div className={styles.timelineLine}>
                        <div className={styles.arrow}>↑</div>
                    </div>
                    <div className={styles.operations}>
                        {[...operations].reverse().map(node => renderNode(node))}
                    </div>
                </div>
            )}
        </div>
    )
}
