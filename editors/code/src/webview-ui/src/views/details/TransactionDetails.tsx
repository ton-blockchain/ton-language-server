import React, {JSX, useEffect, useMemo, useState} from "react"
import styles from "./TransactionDetails.module.css"
import {
  processRawTransactions,
  RawTransactionInfo,
  RawTransactions,
} from "../../../../providers/lib/raw-transaction"
import {TransactionInfo} from "../../../../providers/lib/transaction"
import {TransactionTree} from "./components"
import {Address, Cell, loadTransaction, loadShardAccount} from "@ton/core"

import {ContractData, DeployedContract} from "../../../../providers/lib/contract"
import {Base64String} from "../../../../common/base64-string"
import {HexString} from "../../../../common/hex-string"

interface LocalTransactionDetails {
  readonly contractAddress: string
  readonly methodName: string
  readonly transactionId?: string
  readonly timestamp: string
  readonly status: "success" | "pending" | "failed"
  readonly resultString?: string
  readonly deployedContracts?: DeployedContract[]
  readonly account?: HexString
  readonly stateInit?: {
    readonly code: Base64String
    readonly data: Base64String
  }
  readonly abi?: object
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

function parseMaybeTransactions(data: string): RawTransactions | undefined {
  try {
    return JSON.parse(data) as RawTransactions
  } catch {
    return undefined
  }
}

export default function TransactionDetails({vscode}: Props): JSX.Element {
  const [transaction, setTransaction] = useState<LocalTransactionDetails | null>(null)
  const [transactionInfos, setTransactionInfos] = useState<TransactionInfo[] | null>(null)

  const parsedAccount = useMemo(() => {
    if (!transaction?.account) return null
    try {
      return loadShardAccount(Cell.fromHex(transaction.account).asSlice())
    } catch (error) {
      console.warn("Failed to parse account data:", error)
      return null
    }
  }, [transaction?.account])

  const parsedStateInit = useMemo(() => {
    if (!transaction?.stateInit?.code || !transaction.stateInit.data) return null
    try {
      const codeCell = Cell.fromBase64(transaction.stateInit.code)
      const dataCell = Cell.fromBase64(transaction.stateInit.data)
      return {
        code: codeCell,
        data: dataCell,
      }
    } catch (error) {
      console.warn("Failed to parse stateInit data:", error)
      return null
    }
  }, [transaction?.stateInit?.code, transaction?.stateInit?.data])

  useMemo(() => {
    if (!transaction || !transaction.resultString) return

    const rawTxs = parseMaybeTransactions(transaction.resultString)
    if (!rawTxs) {
      return
    }

    const parsedTransactions = rawTxs.transactions.map(
      (it): RawTransactionInfo => ({
        ...it,
        transaction: it.transaction,
        parsedTransaction: loadTransaction(Cell.fromHex(it.transaction).asSlice()),
      }),
    )

    const transactionInfos = processRawTransactions(parsedTransactions)
    setTransactionInfos(transactionInfos)
  }, [transaction, setTransactionInfos])

  useEffect(() => {
    const handleMessage = (event: MessageEvent<Message>): void => {
      const message = event.data
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (message.type === "updateTransactionDetails") {
        setTransaction(message.transaction)
      }
    }

    window.addEventListener("message", handleMessage)
    return () => {
      window.removeEventListener("message", handleMessage)
    }
  }, [])

  const contracts: ContractData[] = useMemo(() => {
    if (!transaction) return []
    if (!transaction.deployedContracts) return []

    return transaction.deployedContracts.flatMap((it, index) => {
      if (!parsedAccount) return []
      const letter = String.fromCodePoint(65 + (index % 26))
      return {
        displayName: it.name,
        address: Address.parse(it.address),
        kind: it.name === "treasury" ? "treasury" : "user-contract",
        letter,
        stateInit: parsedStateInit ?? undefined,
        account: parsedAccount,
        abi: it.abi,
      } satisfies ContractData
    })
  }, [transaction?.deployedContracts, parsedStateInit, parsedAccount])

  if (!transaction) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingIcon}>📋</div>
        <div>Waiting for transaction details...</div>
      </div>
    )
  }

  return (
    <div className={styles.container + " dark-theme"}>
      {transactionInfos && (
        <div className={styles.transactionsSection}>
          <div className={styles.sectionTitle}>Transaction Details</div>
          <TransactionTree testData={{transactions: transactionInfos, contracts}} />
        </div>
      )}
    </div>
  )
}
