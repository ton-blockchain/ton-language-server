import React from "react"
import {createRoot} from "react-dom/client"
import App from "./App"
import "./main.css"

declare function acquireVsCodeApi(): {
    readonly postMessage: (msg: unknown) => void
    readonly setState: (state: unknown) => void
    readonly getState: () => unknown
}

const vscode = acquireVsCodeApi()

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.querySelector("#root")!).render(
    <React.StrictMode>
        <App vscode={vscode} />
    </React.StrictMode>,
)
