//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import React from "react"
import {createRoot} from "react-dom/client"

import {TestsApp} from "./TestsApp"
import {TestsVSCodeAPI} from "./sandbox-tests-types"

declare function acquireVsCodeApi(): TestsVSCodeAPI

const vscode = acquireVsCodeApi()

const container = document.querySelector("#root")
if (!container) {
  throw new Error("Root element not found")
}

const root = createRoot(container)
root.render(
  <React.StrictMode>
    <TestsApp vscode={vscode} />
  </React.StrictMode>,
)
