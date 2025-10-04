import React from "react"
import {createRoot} from "react-dom/client"

import TransactionDetails from "./TransactionDetails"
import {VSCodeTransactionDetailsAPI} from "./transaction-details-types"

import "../../main.css"
import "../../index.css"

declare function acquireVsCodeApi(): VSCodeTransactionDetailsAPI

const vscode = acquireVsCodeApi()

const container = document.querySelector("#transaction-details-root")
if (container) {
  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <TransactionDetails vscode={vscode} />
    </React.StrictMode>,
  )
} else {
  console.error("Root element not found")
}
