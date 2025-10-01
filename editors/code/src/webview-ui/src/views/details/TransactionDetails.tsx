import React, {JSX, useEffect, useMemo, useState} from "react"

import {Address, Cell, loadShardAccount, loadTransaction} from "@ton/core"

import {TransactionDetailsInfo, TransactionInfo} from "../../../../common/types/transaction"
import {
  processRawTransactions,
  RawTransactionInfo,
  RawTransactions,
} from "../../../../common/types/raw-transaction"

import {ContractData} from "../../../../common/types/contract"
import {LoadingSpinner} from "../../components/common"

import {TransactionTree} from "./components"

import styles from "./TransactionDetails.module.css"

interface Message {
  readonly type: "updateTransactionDetails"
  readonly transaction: TransactionDetailsInfo
}

interface AddTransactionsMessage {
  readonly type: "addTransactions"
  readonly resultString: string
}

interface Props {
  readonly vscode: {
    readonly postMessage: (message: unknown) => void
  }
}

export default function TransactionDetails({vscode}: Props): JSX.Element {
  const [transaction, setTransaction] = useState<TransactionDetailsInfo | null>(null)
  const [transactions, setTransactions] = useState<TransactionInfo[] | null>(null)

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
    if (!transaction?.stateInit?.code || !transaction.stateInit.data) return undefined
    try {
      return {
        code: Cell.fromBase64(transaction.stateInit.code),
        data: Cell.fromBase64(transaction.stateInit.data),
      }
    } catch (error) {
      console.warn("Failed to parse stateInit data:", error)
      return undefined
    }
  }, [transaction?.stateInit?.code, transaction?.stateInit?.data])

  useMemo(() => {
    if (!transaction || !transaction.resultString) return

    const transactionInfos = processTxString(transaction.resultString)
    if (!transactionInfos) {
      return
    }
    setTransactions(transactionInfos)
  }, [transaction, setTransactions])

  const addTransactions = (resultString: string): void => {
    const newTransactionInfos = processTxString(resultString)
    if (!newTransactionInfos) {
      return
    }

    setTransactions(prevTransactions => {
      if (!prevTransactions) {
        return newTransactionInfos
      }

      const existingLts = new Set(prevTransactions.map(tx => tx.transaction.lt.toString()))

      const filteredNewTransactions = newTransactionInfos.filter(
        tx => !existingLts.has(tx.transaction.lt.toString()),
      )

      return [...prevTransactions, ...filteredNewTransactions]
    })
  }

  useEffect(() => {
    const handleMessage = (event: MessageEvent<Message | AddTransactionsMessage>): void => {
      const message = event.data

      if (message.type === "updateTransactionDetails") {
        setTransaction(message.transaction)
      } else {
        addTransactions(message.resultString)
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
        stateInit: parsedStateInit,
        account: parsedAccount,
        abi: it.abi,
      } satisfies ContractData
    })
  }, [transaction, parsedAccount, parsedStateInit])

  if (!transaction) {
    return <LoadingSpinner message="Waiting for transaction details..." />
  }

  return (
    <div className={styles.container}>
      {transactions && <TransactionTree transactions={transactions} contracts={contracts} />}
    </div>
  )
}

function parseTransactions(data: string): RawTransactions | undefined {
  try {
    return JSON.parse(data) as RawTransactions
  } catch {
    return undefined
  }
}

function processTxString(resultString: string): TransactionInfo[] | undefined {
  const rawTxs = parseTransactions(resultString)
  if (!rawTxs) {
    return undefined
  }

  const parsedTransactions = rawTxs.transactions.map(
    (it): RawTransactionInfo => ({
      ...it,
      transaction: it.transaction,
      parsedTransaction: loadTransaction(Cell.fromHex(it.transaction).asSlice()),
    }),
  )

  return processRawTransactions(parsedTransactions)
}
