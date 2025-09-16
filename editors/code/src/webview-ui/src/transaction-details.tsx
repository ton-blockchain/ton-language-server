import React from "react"
import {createRoot} from "react-dom/client"
import TransactionDetails from "./components/TransactionDetails"

import "./main.css"
import "./index.css"

declare function acquireVsCodeApi(): {
    readonly postMessage: (msg: unknown) => void
    readonly setState: (state: unknown) => void
    readonly getState: () => unknown
}

const vscode = acquireVsCodeApi()

const container = document.querySelector("#transaction-details-root")
if (container) {
    const root = createRoot(container)
    root.render(<TransactionDetails vscode={vscode} />)
}
