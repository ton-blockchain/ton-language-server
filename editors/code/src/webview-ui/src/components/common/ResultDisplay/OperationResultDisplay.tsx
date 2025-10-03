import React from "react"

import {VscCheck, VscError, VscListSelection} from "react-icons/vsc"

import styles from "./OperationResultDisplay.module.css"

interface Result {
  readonly success: boolean
  readonly message: string
  readonly details?: string
}

interface LastTransaction {
  readonly contractAddress: string
  readonly methodName: string
  readonly transactionId?: string
  readonly timestamp: string
}

interface Props {
  readonly result: Result
  readonly lastTransaction?: LastTransaction
  readonly onShowTransactionDetails?: (tx: LastTransaction) => void
  readonly onClose?: () => void
}

export const OperationResultDisplay: React.FC<Props> = ({
  result,
  lastTransaction,
  onShowTransactionDetails,
  onClose,
}) => {
  return (
    <div className={styles.resultContainer}>
      <div className={`${styles.result} ${result.success ? styles.success : styles.error}`}>
        <div className={styles.resultHeader}>
          <div className={styles.resultIcon}>{result.success ? <VscCheck /> : <VscError />}</div>
          <div className={styles.resultTitle}>
            {result.success ? "Operation completed successfully" : "Operation failed"}
          </div>
          {onClose && (
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
        <div className={styles.resultMessage}>{result.message}</div>
        {result.details && <div className={styles.resultDetails}>{result.details}</div>}
        {result.success && lastTransaction && onShowTransactionDetails && (
          <div className={styles.resultActions}>
            <button
              onClick={() => {
                onShowTransactionDetails(lastTransaction)
              }}
              className={styles.transactionDetailsButton}
              type="button"
            >
              <VscListSelection />
              Show Transaction Details
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
