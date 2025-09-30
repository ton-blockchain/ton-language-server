import React, {useState, useEffect} from "react"
import styles from "./StatesView.module.css"
import {StatesVSCodeAPI} from "../states-types"
import {VscDebugAlt, VscInfo, VscDebugStepInto} from "react-icons/vsc"
import {
    processRawTransactions,
    RawTransactionInfo,
    RawTransactions,
} from "../../../providers/lib/raw-transaction"
import {Cell, loadTransaction} from "@ton/core"
import {DeployedContract} from "../../../providers/lib/contract"
import {OperationNode} from "../../../providers/methods"

interface Props {
    readonly operations: OperationNode[]
    readonly contracts?: DeployedContract[]
    readonly onLoadOperations: () => void
    readonly isLoading?: boolean
    readonly vscode: StatesVSCodeAPI
}

export const StatesView: React.FC<Props> = ({
    operations,
    contracts = [],
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

        const contract = contracts.find(c => c.address === nameOrAddress)
        if (contract?.name) {
            return contract.name
        }

        return `${nameOrAddress.slice(0, 3)}...${nameOrAddress.slice(-3)}`
    }

    const getMessageName = (
        contractAddress: string | undefined,
        opcode: number | undefined,
    ): string | undefined => {
        if (!contractAddress || !opcode) return undefined

        const contract = contracts.find(c => c.address === contractAddress)
        if (!contract?.abi || typeof contract.abi !== "object") return undefined

        const abi = contract.abi
        const message = abi.messages.find(msg => msg.opcode === opcode)
        return message?.name
    }

    const renderNode = (node: OperationNode): React.JSX.Element => {
        const isDetailsExpanded = expandedDetails.has(node.id)

        const transactionInfos = (() => {
            if (!node.resultString) {
                return []
            }
            const rawTxs = parseMaybeTransactions(node.resultString)
            if (!rawTxs) {
                return []
            }

            const parsedTransactions = rawTxs.transactions.map(
                (it): RawTransactionInfo => ({
                    ...it,
                    transaction: it.transaction,
                    parsedTransaction: loadTransaction(Cell.fromHex(it.transaction).asSlice()),
                }),
            )

            return processRawTransactions(parsedTransactions)
        })()

        const nonZeroExitCode = transactionInfos.find(it => {
            if (it.computeInfo === "skipped") return false
            return it.computeInfo.exitCode !== 0
        })
        const exitCode = nonZeroExitCode === undefined ? 0 : nonZeroExitCode.code

        const failedClassName = exitCode === 0 ? "" : styles.failed

        const contract = contracts.find(c => c.address === node.toContract)
        const hasSourceMap = contract?.sourceMap !== undefined

        const opcode = transactionInfos[0]?.opcode

        return (
            <div key={node.id} className={styles.nodeContainer}>
                <div
                    className={`${styles.node} ${failedClassName} ${styles.compact} ${isDetailsExpanded ? styles.expanded : ""}`}
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
                                    {formatContractName(node.fromContract ?? "")}
                                </span>
                                <span className={styles.label}>
                                    {getMessageName(node.toContract, opcode) ??
                                        (opcode ? "0x" + opcode.toString(16) : "unknown")}{" "}
                                    →
                                </span>
                                <span className={styles.contractName}>
                                    {formatContractName(node.toContract ?? "")}
                                </span>
                            </>
                        ) : node.type === "send-external" && node.contractAddress ? (
                            <>
                                <span className={styles.label}>
                                    →{" "}
                                    {getMessageName(node.contractAddress, opcode) ??
                                        (opcode ? "0x" + opcode.toString(16) : "external")}{" "}
                                </span>
                                <span className={styles.contractName}>
                                    {formatContractName(node.contractAddress)}
                                </span>
                            </>
                        ) : node.contractAddress ? (
                            <>
                                {node.type === "deploy" && (
                                    <span className={styles.label}>Deploy </span>
                                )}
                                <span className={styles.contractName}>
                                    {formatContractName(node.contractAddress)}
                                </span>
                            </>
                        ) : null}

                        <span className={styles.timestamp}>
                            {hasSourceMap && (
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
                                    <VscDebugAlt size={12} />
                                </button>
                            )}
                            <button
                                className={styles.detailsButton}
                                title="View transaction details"
                                onClick={e => {
                                    e.stopPropagation()
                                    vscode.postMessage({
                                        type: "showTransactionDetails",
                                        contractAddress:
                                            node.contractAddress ??
                                            node.fromContract ??
                                            node.toContract ??
                                            "",
                                        methodName: node.details ?? "transaction",
                                        transactionId: node.id,
                                        timestamp: node.timestamp,
                                        resultString: node.resultString,
                                    })
                                }}
                            >
                                <VscInfo size={12} />
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
                        <VscDebugStepInto size={12} />
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

function parseMaybeTransactions(data: string): RawTransactions | undefined {
    try {
        return JSON.parse(data) as RawTransactions
    } catch {
        return undefined
    }
}
