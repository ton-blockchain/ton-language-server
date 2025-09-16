import React from "react"
import {createRoot} from "react-dom/client"
import StatesApp from "./StatesApp"
import {StatesVSCodeAPI} from "./states-types"
import "./main.css"

declare function acquireVsCodeApi(): StatesVSCodeAPI

const vscode = acquireVsCodeApi()

const container = document.querySelector("#root")
if (container) {
    const root = createRoot(container)
    root.render(<StatesApp vscode={vscode} />)
} else {
    console.error("Root element not found")
}
