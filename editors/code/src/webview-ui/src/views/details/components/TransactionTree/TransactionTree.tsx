/* eslint-disable unicorn/prefer-spread */
import React, {useMemo, useState, useRef, useEffect} from "react"
import {Orientation, RawNodeDatum, TreeLinkDatum, Tree} from "react-d3-tree"
import {Address} from "@ton/core"

import {TransactionDetails} from "../index"

import {formatCurrency} from "../../../../components/format/format"
import {ContractData} from "../../../../../../common/types/contract"
import {TransactionInfo} from "../../../../../../common/types/transaction"

import {ParsedDataView} from "../ParsedDataView/ParsedDataView"

import {parseData, ParsedObject} from "../../../../../../common/binary"

import {useTooltip} from "./useTooltip"
import {SmartTooltip} from "./SmartTooltip"

import styles from "./TransactionTree.module.css"

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
  readonly transactions: TransactionInfo[]
  readonly contracts: ContractData[]
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
          {data.computePhase.exitCode !== undefined && data.computePhase.exitCode !== 0 && (
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

interface NodeTooltipData {
  readonly contractState?: ParsedObject
  readonly contractStateBefore?: ParsedObject
  readonly contractData: ContractData
}

function NodeTooltipContent({
  data,
  contracts,
}: {
  data: NodeTooltipData
  contracts: Map<string, ContractData>
}): React.JSX.Element {
  return (
    <div className={styles.tooltipContent}>
      <div className={styles.tooltipField}>
        <div className={styles.tooltipFieldLabel}>Contract State</div>
        <div className={styles.tooltipFieldValue}>
          <div className={styles.contractStateData}>
            {data.contractState && (
              <ParsedDataView
                data={data.contractState}
                dataBefore={data.contractStateBefore}
                contracts={contracts}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function TransactionTree({
  transactions,
  contracts,
}: TransactionTreeProps): React.JSX.Element {
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
  const triggerRectRef = useRef<DOMRect | null>(null)

  const contractsMap: Map<string, ContractData> = useMemo(
    () => new Map(contracts.map(it => [it.address.toString(), it])),
    [contracts],
  )

  const rootTransactions = useMemo(() => {
    return transactions
      .filter(tx => !tx.parent)
      .sort((a, b) => Number(a.transaction.lt - b.transaction.lt))
  }, [transactions])

  const calculateTreeDimensions = (data: RawNodeDatum): {height: number; width: number} => {
    const getDepth = (node: RawNodeDatum, currentDepth = 0): number => {
      if (!node.children || node.children.length === 0) {
        return currentDepth
      }
      return Math.max(...node.children.map(child => getDepth(child, currentDepth + 1)))
    }

    const countNodes = (node: RawNodeDatum): number => {
      if (!node.children || node.children.length === 0) {
        return 1
      }
      return node.children.reduce((sum: number, child) => sum + countNodes(child), 0)
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
    for (const tx of transactions) {
      map.set(tx.transaction.lt.toString(), tx)
    }
    return map
  }, [transactions])

  const handleNodeClick = (lt: string): void => {
    const transaction = transactionMap.get(lt)
    if (!transaction) return

    forceHideTooltip()

    if (selectedTransaction?.transaction.lt.toString() === lt) {
      setSelectedTransaction(null)
      setSelectedContract(null)
    } else {
      setSelectedTransaction(transaction)
      setSelectedContract(null)
    }
  }

  const handleContractClick = (contractAddress: string): void => {
    const contract = contractsMap.get(contractAddress)
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

  const showNodeTooltip = (event: React.MouseEvent, tx: TransactionInfo | undefined): void => {
    if (!tx || !tx.address) return

    const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
    triggerRectRef.current = rect

    const contract = contractsMap.get(tx.address.toString())
    if (!contract) return

    if (!contract.abi || !contract.abi.storage || !tx.oldStorage || !tx.newStorage) return

    try {
      const contractStateBefore = parseData(
        contract.abi,
        contract.abi.storage,
        tx.oldStorage.asSlice(),
      )
      const contractStateAfter = parseData(
        contract.abi,
        contract.abi.storage,
        tx.newStorage.asSlice(),
      )

      const nodeTooltipData: NodeTooltipData = {
        contractState: contractStateAfter,
        contractStateBefore,
        contractData: contract,
      }

      showTooltip({
        x: rect.left,
        y: rect.top,
        content: <NodeTooltipContent data={nodeTooltipData} contracts={contractsMap} />,
      })
    } catch (error) {
      console.error("Error parsing contract state:", error)
    }
  }

  const treeData: RawNodeDatum = useMemo(() => {
    const convertTransactionToNode = (tx: TransactionInfo): RawNodeDatum => {
      const thisAddress = tx.address
      const addressName = formatAddress(thisAddress, contractsMap)

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

      const targetContract = thisAddress ? contractsMap.get(thisAddress.toString()) : undefined
      const typeAbi = targetContract?.abi?.messages.find(it => it.opcode === opcode)
      const opcodeNane = typeAbi?.name

      const opcodeHex = opcodeNane ?? (opcode ? "0x" + opcode.toString(16) : "empty")

      const contractLetter = thisAddress ? (targetContract?.letter ?? "?") : "?"

      const lt = tx.transaction.lt.toString()
      const isSelected = selectedTransaction?.transaction.lt.toString() === lt

      const hasExternalOut = tx.transaction.outMessages.values().some(outMsg => {
        return outMsg.info.type === "external-out"
      })

      const externalOutChildren = hasExternalOut
        ? [
            {
              name: "",
              attributes: {
                isExternalOut: true,
                parentLt: lt,
              },
              children: [],
            },
          ]
        : []

      return {
        name: addressName,
        attributes: {
          from: tx.transaction.inMessage?.info.src?.toString() ?? "unknown",
          to: tx.transaction.inMessage?.info.dest?.toString() ?? "unknown",
          lt,
          success: isSuccess ? "✓" : "✗",
          exitCode: exitCode?.toString() ?? "0",
          value: formatCurrency(value),
          opcode: opcodeHex,
          outMsgs: tx.transaction.outMessagesCount.toString(),
          withInitCode,
          isBounced,
          contractLetter,
          isSelected,
        },
        children: [...tx.children.map(it => convertTransactionToNode(it)), ...externalOutChildren],
      } satisfies RawNodeDatum
    }

    if (rootTransactions.length > 0) {
      return {
        name: "",
        attributes: {
          isRoot: "true",
        },
        children: rootTransactions.map(it => convertTransactionToNode(it)),
      }
    }

    return {
      name: "No transactions",
      attributes: {
        isRoot: false,
      },
      children: [],
    }
  }, [rootTransactions, contractsMap, selectedTransaction])

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

    if (nodeDatum.attributes?.isExternalOut) {
      const parentLt = nodeDatum.attributes.parentLt as string
      const parentTx = transactionMap.get(parentLt)

      const externalOutMsg = parentTx?.transaction.outMessages
        .values()
        .find(msg => msg.info.type === "external-out")
      const externalOutDest = externalOutMsg?.info.dest?.toString() ?? "External"
      const createdLt =
        externalOutMsg?.info.type === "external-out" ? externalOutMsg.info.createdLt.toString() : ""

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
            fill="transparent"
            stroke="var(--color-border)"
            strokeWidth={1}
            className={styles.nodeCircleDefault}
          />

          <foreignObject width="150" height="100" x="-180" y="-40">
            <div className={styles.edgeText}>
              <div className={styles.topText}>
                <p className={styles.edgeTextTitle}>{externalOutDest}</p>
                <p className={styles.edgeTextContent}>Lt: {createdLt}</p>
              </div>
              <div className={styles.bottonText}>
                <p className={styles.edgeTextContent}>Type: external-out</p>
              </div>
            </div>
          </foreignObject>
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
          onMouseEnter={event => {
            if (!tx?.address) return
            showNodeTooltip(event, tx)
          }}
          onMouseLeave={() => {
            hideTooltip()
          }}
          className={styles.nodeCircle}
        />

        <text
          fill={isSelected ? "var(--color-background-primary)" : "var(--color-text-primary)"}
          strokeWidth="0"
          x="0"
          y="5"
          fontSize="14"
          fontWeight="bold"
          textAnchor="middle"
          className={styles.nodeText}
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
                <p className={styles.edgeTextContent}>{nodeDatum.attributes.value}</p>
              )}
            </div>
            <div className={styles.bottonText}>
              <p className={styles.edgeTextContent}>
                {isNumberOpcode ? <>Opcode: {opcode}</> : opcode}
              </p>
              {nodeDatum.attributes?.exitCode && nodeDatum.attributes.exitCode !== "0" && (
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

  useEffect(() => {
    // deselect transaction if we select other transaction details
    setSelectedTransaction(null)
  }, [transactions])

  return (
    <div className={styles.container}>
      <div className={styles.treeContainer} style={{height: `${treeDimensions.height}px`}}>
        <div className={styles.treeWrapper} style={{width: `${treeDimensions.width}px`}}>
          <Tree
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
          <TransactionDetails
            tx={selectedTransaction}
            transactions={transactions}
            contracts={contractsMap}
            onContractClick={handleContractClick}
          />
        </div>
      )}
    </div>
  )
}
