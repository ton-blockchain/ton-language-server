import React, {useEffect, useState, useCallback} from "react"
import {HistoryView} from "./components/HistoryView"
import {StatesVSCodeAPI, UpdateOperationsMessage} from "./sandbox-history-types"
import {DeployedContract} from "../../../../providers/lib/contract"
import {OperationNode} from "../../../../providers/methods"

interface Props {
  readonly vscode: StatesVSCodeAPI
}

export default function HistoryApp({vscode}: Props): React.JSX.Element {
  const [operations, setOperations] = useState<OperationNode[]>([])
  const [contracts, setContracts] = useState<DeployedContract[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadOperations = useCallback(() => {
    setIsLoading(true)
    vscode.postMessage({
      type: "loadOperations",
    })
  }, [vscode])

  useEffect(() => {
    const handleMessage = (event: MessageEvent<UpdateOperationsMessage>): void => {
      const message: UpdateOperationsMessage = event.data

      switch (message.type) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        case "updateOperations": {
          setOperations(message.operations)
          setContracts(message.contracts ?? [])
          setIsLoading(message.isLoading ?? false)
          break
        }
      }
    }

    window.addEventListener("message", handleMessage)

    vscode.postMessage({
      type: "webviewReady",
    })

    return () => {
      window.removeEventListener("message", handleMessage)
    }
  }, [vscode])

  return (
    <HistoryView
      operations={operations}
      contracts={contracts}
      onLoadOperations={loadOperations}
      isLoading={isLoading}
      vscode={vscode}
    />
  )
}
