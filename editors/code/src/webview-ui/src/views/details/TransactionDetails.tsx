import React, {JSX, useEffect, useMemo, useState} from "react"

import {Address} from "@ton/core"

import {TransactionDetailsInfo, TransactionInfo} from "../../../../common/types/transaction"
import {processTxString} from "../../../../common/types/raw-transaction"

import {ContractData} from "../../../../common/types/contract"
import {LoadingSpinner} from "../../components/common"

import {VSCodeTransactionDetailsAPI} from "./transaction-details-types"

import {TransactionTree} from "./components"

import styles from "./TransactionDetails.module.css"

interface Message {
  readonly type: "updateTransactionDetails"
  readonly transaction: TransactionDetailsInfo
}

interface AddTransactionsMessage {
  readonly type: "addTransactions"
  readonly serializedResult: string
}

interface Props {
  readonly vscode: VSCodeTransactionDetailsAPI
}

export default function TransactionDetails({vscode}: Props): JSX.Element {
  const [transaction, setTransaction] = useState<TransactionDetailsInfo | undefined>(undefined)
  const [transactions, setTransactions] = useState<TransactionInfo[] | undefined>(undefined)

  useMemo(() => {
    if (!transaction || !transaction.serializedResult) return

    const transactionInfos = processTxString(transaction.serializedResult)
    if (!transactionInfos) {
      return
    }
    setTransactions(transactionInfos)
  }, [transaction, setTransactions])

  const addTransactions = (serializedResult: string): void => {
    const newTransactionInfos = processTxString(serializedResult)
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
        addTransactions(message.serializedResult)
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
      const letter = String.fromCodePoint(65 + (index % 26))
      return {
        displayName: it.name,
        address: Address.parse(it.address),
        kind: it.name === "treasury" ? "treasury" : "user-contract",
        letter,
        abi: it.abi,
      } satisfies ContractData
    })
  }, [transaction])

  if (!transaction) {
    return <LoadingSpinner message="Waiting for transaction details..." />
  }

  return (
    <div className={styles.container}>
      {transactions && (
        <TransactionTree vscode={vscode} transactions={transactions} contracts={contracts} />
      )}
    </div>
  )
}
