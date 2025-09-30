import React from "react"
import {createRoot} from "react-dom/client"
import TransactionDetails from "./TransactionDetails"

import "../../main.css"
import "../../index.css"

declare function acquireVsCodeApi(): {
  readonly postMessage: (msg: unknown) => void
  readonly setState: (state: unknown) => void
  readonly getState: () => unknown
}

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
