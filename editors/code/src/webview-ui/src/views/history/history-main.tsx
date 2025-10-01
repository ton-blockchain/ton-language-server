import React from "react"
import {createRoot} from "react-dom/client"

import HistoryApp from "./HistoryApp"
import {StatesVSCodeAPI} from "./sandbox-history-types"

import "../../main.css"
import "../../index.css"

declare function acquireVsCodeApi(): StatesVSCodeAPI

const vscode = acquireVsCodeApi()

const container = document.querySelector("#root")
if (container) {
  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <HistoryApp vscode={vscode} />
    </React.StrictMode>,
  )
} else {
  console.error("Root element not found")
}
