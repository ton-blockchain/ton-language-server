/* eslint-disable unicorn/prefer-spread */
import React, {useMemo, useState, useRef} from "react"
import {Orientation, RawNodeDatum, TreeLinkDatum, Tree} from "react-d3-tree"
import {Address} from "@ton/core"

import {TransactionShortInfo} from "../"

import {useTooltip} from "./useTooltip"
import {SmartTooltip} from "./SmartTooltip"

import styles from "./TransactionTree.module.css"
import {formatCurrency} from "../../format/format"
import {ContractData} from "../../../../../providers/lib/contract"
import {TransactionInfo} from "../../../../../providers/lib/transaction"

interface TransactionTooltipData {
    readonly fromAddress: string
    readonly computePhase: {
        readonly success: boolean
        readonly exitCode?: number
        readonly gasUsed?: bigint
        readonly vmSteps?: number
    }
    readonly fees: {
        readonly gasFees?: bigint
        readonly totalFees: bigint
    }
    readonly sentTotal: bigint
}

interface TransactionTreeProps {
    readonly testData: {
        readonly transactions: TransactionInfo[]
    }
}

const formatAddress = (
    address: Address | undefined,
    contracts: Map<string, ContractData>,
): string => {
    if (!address) {
        return "unknown"
    }

    const addressStr = address.toString()
    const meta = contracts.get(addressStr)
    if (meta) {
        const name = meta.displayName
        if (name !== "Unknown Contract") {
            return name
        }
    }

    return addressStr.slice(0, 4) + "..." + addressStr.slice(-4)
}

const formatAddressShort = (address: Address | undefined): string => {
    if (!address) {
        return "unknown"
    }

    const addressStr = address.toString()
    return addressStr.slice(0, 6) + "..." + addressStr.slice(-6)
}

function TransactionTooltipContent({data}: {data: TransactionTooltipData}): React.JSX.Element {
    return (
        <div className={styles.tooltipContent}>
            <div className={styles.tooltipField}>
                <div className={styles.tooltipFieldLabel}>From Address</div>
                <div className={styles.tooltipFieldValue}>{data.fromAddress}</div>
            </div>

            <div className={styles.tooltipField}>
                <div className={styles.tooltipFieldLabel}>Compute Phase</div>
                <div className={styles.tooltipFieldValue}>
                    {data.computePhase.success ? "Success" : "Failed"}
                    {data.computePhase.exitCode !== undefined &&
                        data.computePhase.exitCode !== 0 && (
                            <span>
                                {" "}
                                {"(Exit:"} {data.computePhase.exitCode})
                            </span>
                        )}
                    {data.computePhase.gasUsed !== undefined && (
                        <div className={styles.tooltipSubValue}>
                            Gas Used: {data.computePhase.gasUsed.toString()}
                        </div>
                    )}
                    {data.computePhase.vmSteps !== undefined && (
                        <div className={styles.tooltipSubValue}>
                            VM Steps: {data.computePhase.vmSteps.toString()}
                        </div>
                    )}
                </div>
            </div>

            <div className={styles.tooltipField}>
                <div className={styles.tooltipFieldLabel}>Money</div>
                <div className={styles.tooltipFieldValue}>
                    <div>Sent Total: {formatCurrency(data.sentTotal)}</div>
                    <div className={styles.tooltipSubValue}>
                        Total Fees: {formatCurrency(data.fees.totalFees)}
                    </div>
                    {data.fees.gasFees !== undefined && (
                        <div className={styles.tooltipSubValue}>
                            Gas Fees: {formatCurrency(data.fees.gasFees)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export function TransactionTree({testData}: TransactionTreeProps): React.JSX.Element {
    const {
        tooltip,
        showTooltip,
        hideTooltip,
        forceHideTooltip,
        setIsTooltipHovered,
        calculateOptimalPosition,
    } = useTooltip()

    const [selectedTransaction, setSelectedTransaction] = useState<TransactionInfo | null>(null)
    const [selectedContract, setSelectedContract] = useState<ContractData | null>(null)
    const [selectedRootLt, setSelectedRootLt] = useState<string | null>(null)
    const triggerRectRef = useRef<DOMRect | null>(null)

    const contracts: Map<string, ContractData> = new Map()

    console.log(testData)

    const rootTransactions = useMemo(() => {
        return testData.transactions
            .filter(tx => !tx.parent)
            .sort((a, b) => Number(a.transaction.lt - b.transaction.lt))
    }, [testData.transactions])

    const getSubtreeTransactions = (rootTx: TransactionInfo): TransactionInfo[] => {
        const result: TransactionInfo[] = [rootTx]

        const addChildren = (tx: TransactionInfo): void => {
            tx.children.forEach(child => {
                result.push(child)
                addChildren(child)
            })
        }

        addChildren(rootTx)
        return result
    }

    const filteredTransactions = useMemo(() => {
        if (!selectedRootLt) {
            return testData.transactions
        }

        const selectedRoot = rootTransactions.find(
            tx => tx.transaction.lt.toString() === selectedRootLt,
        )
        if (!selectedRoot) {
            return testData.transactions
        }

        return getSubtreeTransactions(selectedRoot)
    }, [testData.transactions, selectedRootLt, rootTransactions])

    const handleRootChange = (rootLt: string | null): void => {
        setSelectedRootLt(rootLt)
        setSelectedTransaction(null)
        setSelectedContract(null)
    }

    const calculateTreeDimensions = (data: {
        children?: unknown[]
    }): {height: number; width: number} => {
        const getDepth = (node: {children?: unknown[]}, currentDepth = 0): number => {
            if (!node.children || node.children.length === 0) {
                return currentDepth
            }
            return Math.max(
                ...node.children.map(child =>
                    getDepth(child as {children?: unknown[]}, currentDepth + 1),
                ),
            )
        }

        const countNodes = (node: {children?: unknown[]}): number => {
            if (!node.children || node.children.length === 0) {
                return 1
            }
            return node.children.reduce(
                (sum: number, child) => sum + countNodes(child as {children?: unknown[]}),
                0,
            ) as number
        }

        const totalNodes = countNodes(data)
        const depth = getDepth(data)

        const height = totalNodes <= 2 ? totalNodes * 80 + 20 : totalNodes * 100 + 100

        return {
            height: Math.max(100, height),
            width: Math.max(800, depth * 200 + 200),
        }
    }

    const transactionMap = useMemo(() => {
        const map: Map<string, TransactionInfo> = new Map()
        for (const tx of filteredTransactions) {
            map.set(tx.transaction.lt.toString(), tx)
        }
        return map
    }, [filteredTransactions])

    const handleNodeClick = (lt: string): void => {
        const transaction = transactionMap.get(lt)
        if (!transaction) return

        if (selectedTransaction?.transaction.lt.toString() === lt) {
            setSelectedTransaction(null)
            setSelectedContract(null)
        } else {
            setSelectedTransaction(transaction)
            setSelectedContract(null)
        }
    }

    const handleContractClick = (contractAddress: string): void => {
        const contract = contracts.get(contractAddress)
        if (!contract) return

        if (selectedContract?.address.toString() === contractAddress) {
            setSelectedContract(null)
        } else {
            setSelectedContract(contract)
        }
    }

    const showTransactionTooltip = (event: React.MouseEvent, tx: TransactionInfo): void => {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
        triggerRectRef.current = rect

        const computeInfo = tx.computeInfo
        const computePhase = {
            success: computeInfo === "skipped" ? true : computeInfo.success,
            exitCode: computeInfo === "skipped" ? undefined : computeInfo.exitCode,
            gasUsed: computeInfo === "skipped" ? undefined : computeInfo.gasUsed,
            vmSteps: computeInfo === "skipped" ? undefined : computeInfo.vmSteps,
        }

        const fees = {
            gasFees: computeInfo === "skipped" ? undefined : computeInfo.gasFees,
            totalFees: tx.money.totalFees,
        }

        const srcAddress = tx.transaction.inMessage?.info.src
        const fromAddressStr = srcAddress ? formatAddressShort(srcAddress as Address) : "unknown"

        const tooltipData: TransactionTooltipData = {
            fromAddress: fromAddressStr,
            computePhase,
            fees,
            sentTotal: tx.money.sentTotal,
        }

        showTooltip({
            x: rect.left,
            y: rect.top,
            content: <TransactionTooltipContent data={tooltipData} />,
        })
    }

    const treeData = useMemo(() => {
        const displayedRoots = selectedRootLt
            ? rootTransactions.filter(tx => tx.transaction.lt.toString() === selectedRootLt)
            : rootTransactions

        const convertTransactionToNode = (tx: TransactionInfo): RawNodeDatum => {
            const thisAddress = tx.address
            const addressName = formatAddress(thisAddress, contracts)

            const computePhase =
                tx.transaction.description.type === "generic"
                    ? tx.transaction.description.computePhase
                    : null

            const inMessage = tx.transaction.inMessage
            const withInitCode = inMessage?.init?.code !== undefined
            const isBounced = inMessage?.info.type === "internal" ? inMessage.info.bounced : false

            const isSuccess = computePhase?.type === "vm" ? computePhase.success : true
            const exitCode =
                computePhase?.type === "vm"
                    ? computePhase.exitCode === 0
                        ? tx.transaction.description.type === "generic"
                            ? (tx.transaction.description.actionPhase?.resultCode ?? 0)
                            : 0
                        : computePhase.exitCode
                    : undefined

            const value =
                tx.transaction.inMessage?.info.type === "internal"
                    ? tx.transaction.inMessage.info.value.coins
                    : undefined

            const opcode = tx.opcode
            const opcodeHex = opcode?.toString(16)

            const contractLetter = thisAddress
                ? (contracts.get(thisAddress.toString())?.letter ?? "?")
                : "?"

            const lt = tx.transaction.lt.toString()
            const isSelected = selectedTransaction?.transaction.lt.toString() === lt

            return {
                name: addressName,
                attributes: {
                    from: tx.transaction.inMessage?.info.src?.toString() ?? "unknown",
                    to: tx.transaction.inMessage?.info.dest?.toString() ?? "unknown",
                    lt,
                    success: isSuccess ? "✓" : "✗",
                    exitCode: exitCode?.toString() ?? "0",
                    value: formatCurrency(value),
                    opcode: `0x${opcodeHex}`,
                    outMsgs: tx.transaction.outMessagesCount.toString(),
                    withInitCode,
                    isBounced,
                    contractLetter,
                    isSelected,
                },
                children: tx.children.map(it => convertTransactionToNode(it)),
            }
        }

        if (displayedRoots.length > 0) {
            return {
                name: "",
                attributes: {
                    isRoot: "true",
                },
                children: displayedRoots.map(it => convertTransactionToNode(it)),
            }
        }

        return {
            name: "No transactions",
            attributes: {},
            children: [],
        }
    }, [rootTransactions, contracts, selectedTransaction, selectedRootLt])

    const renderCustomNodeElement = ({
        nodeDatum,
        toggleNode: _toggleNode,
    }: {
        nodeDatum: RawNodeDatum
        toggleNode: () => void
    }): React.JSX.Element => {
        if (nodeDatum.attributes?.isRoot === "true") {
            return (
                <g>
                    <circle
                        r={15}
                        fill={"var(--color-background-secondary)"}
                        stroke="var(--color-text-primary)"
                        strokeWidth={1.5}
                    />
                    <text
                        fill="var(--color-text-primary)"
                        strokeWidth="0"
                        x="0"
                        y="5"
                        fontSize="14"
                        fontWeight="bold"
                        textAnchor="middle"
                    >
                        BL
                    </text>
                </g>
            )
        }

        const opcode = (nodeDatum.attributes?.opcode as string | undefined) ?? "empty opcode"
        const isNumberOpcode = !Number.isNaN(Number.parseInt(opcode))
        const isSelected = nodeDatum.attributes?.isSelected as boolean
        const lt = nodeDatum.attributes?.lt as string
        const tx = transactionMap.get(lt)

        return (
            <g>
                <foreignObject
                    width="4"
                    height="6"
                    x="-20"
                    y="-3"
                    className={styles.foreignObjectContainer}
                >
                    <svg
                        width="4"
                        height="6"
                        viewBox="0 0 4 5"
                        xmlns="http://www.w3.org/2000/svg"
                        className={styles.iconSvg}
                    >
                        <path
                            d="M0.400044 0.549983C0.648572 0.218612 1.11867 0.151455 1.45004 0.399983L3.45004 1.89998C3.6389 2.04162 3.75004 2.26392 3.75004 2.49998C3.75004 2.73605 3.6389 2.95834 3.45004 3.09998L1.45004 4.59998C1.11867 4.84851 0.648572 4.78135 0.400044 4.44998C0.151516 4.11861 0.218673 3.64851 0.550044 3.39998L1.75004 2.49998L0.550044 1.59998C0.218673 1.35145 0.151516 0.881354 0.400044 0.549983Z"
                            fill="var(--color-text-tertiary)"
                        ></path>
                    </svg>
                </foreignObject>
                <circle
                    r={15}
                    fill={
                        isSelected
                            ? "var(--color-text-primary)"
                            : nodeDatum.attributes?.success === "✓"
                              ? "var(--color-background-secondary)"
                              : "#ef4444"
                    }
                    stroke={"var(--color-text-primary)"}
                    strokeWidth={1.5}
                    onClick={() => {
                        handleNodeClick(lt)
                    }}
                    onMouseLeave={() => {
                        hideTooltip()
                    }}
                    style={{cursor: "pointer"}}
                />

                <text
                    fill={
                        isSelected ? "var(--color-background-primary)" : "var(--color-text-primary)"
                    }
                    strokeWidth="0"
                    x="0"
                    y="5"
                    fontSize="14"
                    fontWeight="bold"
                    textAnchor="middle"
                    style={{pointerEvents: "none"}}
                >
                    {nodeDatum.attributes?.contractLetter}
                </text>
                <foreignObject width="150" height="100" x="-180" y="-40">
                    <div
                        className={styles.edgeText}
                        onMouseEnter={event => {
                            if (!tx) return
                            showTransactionTooltip(event, tx)
                        }}
                        onMouseLeave={() => {
                            hideTooltip()
                        }}
                    >
                        <div className={styles.topText}>
                            <p className={styles.edgeTextTitle}>{nodeDatum.name}</p>
                            {nodeDatum.attributes?.value && (
                                <p className={styles.edgeTextContent}>
                                    {nodeDatum.attributes.value}
                                </p>
                            )}
                        </div>
                        <div className={styles.bottonText}>
                            <p className={styles.edgeTextContent}>
                                {isNumberOpcode ? <>Opcode: {opcode}</> : opcode}
                            </p>
                            {nodeDatum.attributes?.exitCode &&
                                nodeDatum.attributes.exitCode !== "0" && (
                                    <p className={styles.edgeTextContent}>
                                        Exit: {nodeDatum.attributes.exitCode} | Success:{" "}
                                        {nodeDatum.attributes.success === "✓" ? "true" : "false"}
                                    </p>
                                )}
                        </div>
                    </div>
                </foreignObject>
            </g>
        )
    }

    const getDynamicPathClass = ({target}: TreeLinkDatum, _orientation: Orientation): string => {
        const attributes = target.data.attributes
        if (attributes && attributes.withInitCode) {
            return styles.edgeStyle + ` ${styles.edgeStyleWithInit}`
        }
        if (attributes && attributes.isBounced) {
            return styles.edgeStyle + ` ${styles.edgeStyleBounced}`
        }

        return styles.edgeStyle
    }

    const treeDimensions = calculateTreeDimensions(treeData)

    return (
        <div className={styles.container}>
            {rootTransactions.length > 1 && (
                <div className={styles.tabsContainer}>
                    <button
                        className={`${styles.tab} ${selectedRootLt ? "" : styles.tabActive}`}
                        onClick={() => {
                            handleRootChange(null)
                        }}
                    >
                        All
                    </button>
                    {rootTransactions.map((rootTx, index) => {
                        const addressName = formatAddress(rootTx.address, contracts)
                        const isActive = selectedRootLt === rootTx.transaction.lt.toString()
                        return (
                            <button
                                key={rootTx.transaction.lt.toString()}
                                className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
                                onClick={() => {
                                    handleRootChange(rootTx.transaction.lt.toString())
                                }}
                            >
                                #{index + 1}: {addressName}
                            </button>
                        )
                    })}
                </div>
            )}
            <div className={styles.treeContainer} style={{height: `${treeDimensions.height}px`}}>
                <div className={styles.treeWrapper} style={{width: `${treeDimensions.width}px`}}>
                    <Tree
                        // @ts-expect-error todo
                        data={treeData}
                        orientation="horizontal"
                        pathFunc={e => {
                            const t = e.target.data.attributes ?? {}
                            return t.isFirst
                                ? "M"
                                      .concat(e.source.y.toString(), ",")
                                      .concat(e.source.x.toString(), "V")
                                      .concat((e.target.x + 10).toString(), "a10 10 0 0 1 10 -10H")
                                      .concat((e.target.y - 18).toString())
                                : t.isLast
                                  ? "M"
                                        .concat(e.source.y.toString(), ",")
                                        .concat(e.source.x.toString(), "V")
                                        .concat((e.target.x - 10).toString(), "a10 10 0 0 0 10 10H")
                                        .concat((e.target.y - 18).toString())
                                  : "M"
                                        .concat(e.source.y.toString(), ",")
                                        .concat(e.source.x.toString(), "V")
                                        .concat(e.target.x.toString(), "H")
                                        .concat((e.target.y - 18).toString())
                        }}
                        nodeSize={{x: 200, y: 120}}
                        separation={{siblings: 0.7, nonSiblings: 1}}
                        renderCustomNodeElement={renderCustomNodeElement}
                        pathClassFunc={getDynamicPathClass}
                        translate={{x: 50, y: treeDimensions.height / 2}}
                        zoom={1}
                        enableLegacyTransitions={false}
                        collapsible={false}
                        zoomable={false}
                        draggable={false}
                        pannable={false}
                        scaleExtent={{min: 1, max: 1}}
                    />
                    {tooltip && triggerRectRef.current && (
                        <SmartTooltip
                            content={tooltip.content}
                            triggerRect={triggerRectRef.current}
                            onMouseEnter={() => {
                                setIsTooltipHovered(true)
                            }}
                            onMouseLeave={() => {
                                setIsTooltipHovered(false)
                            }}
                            onForceHide={forceHideTooltip}
                            calculateOptimalPosition={calculateOptimalPosition}
                        />
                    )}
                </div>
            </div>

            {selectedTransaction && (
                <div className={styles.transactionDetails}>
                    <TransactionShortInfo
                        tx={selectedTransaction}
                        transactions={testData.transactions}
                        contracts={contracts}
                        onContractClick={handleContractClick}
                    />
                </div>
            )}
        </div>
    )
}
