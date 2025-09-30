import React from "react"
import {createRoot} from "react-dom/client"
import ActionsApp from "./ActionsApp"
import "../../main.css"

declare function acquireVsCodeApi(): {
  readonly postMessage: (msg: unknown) => void
  readonly setState: (state: unknown) => void
  readonly getState: () => unknown
}

const vscode = acquireVsCodeApi()

const container = document.querySelector("#root")
if (container) {
  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <ActionsApp vscode={vscode} />
    </React.StrictMode>,
  )
} else {
  console.error("Root element not found")
}
