import React, {useMemo, useState, useEffect} from "react"
import styles from "./ContractInfo.module.css"
import {Cell, loadShardAccount} from "@ton/core"
import {ContractInfoData, VSCodeAPI} from "../../sandbox-actions-types"
import {VscEdit, VscFileCode, VscTrash, VscCopy, VscCheck} from "react-icons/vsc"
import {DeployedContract} from "../../../../../../providers/lib/contract"
import * as binary from "../../../../../../providers/binary"

interface Props {
  readonly info: ContractInfoData | undefined
  readonly contractAddress?: string
  readonly contracts?: DeployedContract[]
  readonly onSendMessage?: () => void
  readonly onCallGetMethod?: () => void
  readonly vscode: VSCodeAPI
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

  const [copySuccess, setCopySuccess] = useState(false)

  const handleCopyContractCode = async (): Promise<void> => {
    if (!info?.stateInit?.code) return

    try {
      await navigator.clipboard.writeText(info.stateInit.code)
      setCopySuccess(true)
    } catch {}
  }

  useEffect(() => {
    let timer: NodeJS.Timeout | undefined
    if (copySuccess) {
      timer = setTimeout(() => {
        setCopySuccess(false)
      }, 2000)
    }
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [copySuccess])

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

  const storageFields = useMemo((): binary.ParsedObject => {
    if (info?.abi && info.account) {
      const account = loadShardAccount(Cell.fromHex(info.account).beginParse())
      const state = account.account?.storage.state
      if (state?.type === "active" && state.state.data && info.abi.storage) {
        return binary.parseData(info.abi, info.abi.storage, state.state.data.asSlice())
      }
    }
    return {}
  }, [info?.abi, info?.account])

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

    const renderStorageFields = (
      fields: binary.ParsedObject,
      depth: number = 0,
    ): React.ReactNode => {
      return Object.entries(fields).map(([fieldName, fieldValue]) => {
        if (fieldValue && typeof fieldValue === "object" && "$" in fieldValue) {
          const nestedObj = fieldValue as binary.NestedObject
          return (
            <div key={fieldName} className={styles.nestedStorageGroup}>
              <div className={styles.nestedStorageHeader}>
                <span className={styles.structFieldName}>{fieldName}</span>
                <span className={styles.structFieldType}>{nestedObj.name}</span>
              </div>
              <div className={styles.nestedStorageContent}>
                {nestedObj.value && renderStorageFields(nestedObj.value, depth + 1)}
              </div>
            </div>
          )
        } else {
          const formattedValue = binary.formatParsedSlice(fieldValue) ?? ""
          const displayValue =
            formattedValue.length > 20 ? formattedValue.slice(0, 20) + "..." : formattedValue

          return (
            <div key={fieldName} className={styles.storageItem}>
              <span className={styles.fieldName}>{fieldName}:</span>
              <span className={styles.fieldValue} title={formattedValue}>
                {displayValue}
              </span>
            </div>
          )
        }
      })
    }

    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.contractTitle}>
              <span className={styles.contractName}>{contractName ?? "Unknown Contract"}</span>
              {contractAddress && (
                <span
                  className={styles.contractNameValue}
                  title={contractAddress}
                  onClick={() => {
                    navigator.clipboard.writeText(contractAddress).catch(console.error)
                  }}
                >
                  {formatAddress(contractAddress)}
                </span>
              )}
            </div>
            <div
              className={`${styles.contractStatus} ${
                isActive ? styles.active : isFrozen ? styles.frozen : styles.inactive
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

          <div className={styles.headerActions}>
            {contractName !== "treasury" && (
              <>
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
              </>
            )}
            <button
              className={`${styles.headerActionButton} ${copySuccess ? styles.copySuccess : ""}`}
              title="Copy contract code as base64"
              onClick={() => void handleCopyContractCode()}
              disabled={!info.stateInit?.code}
            >
              {copySuccess ? <VscCheck size={14} /> : <VscCopy size={14} />}
            </button>
            {contractName !== "treasury" && (
              <button
                className={`${styles.headerActionButton} ${styles.deleteButton}`}
                title="Delete contract"
                onClick={handleDeleteContract}
              >
                <VscTrash size={14} />
              </button>
            )}
          </div>
        </div>

        {Object.keys(storageFields).length > 0 && (
          <div className={styles.storageSection}>
            <div className={styles.sectionTitle}>Storage</div>
            <div className={styles.storageGrid}>{renderStorageFields(storageFields)}</div>
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.actionButton} onClick={onSendMessage} disabled={!onSendMessage}>
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
