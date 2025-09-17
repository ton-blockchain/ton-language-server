import React, {useEffect, useState, useCallback} from "react"
import {StatesView, OperationNode} from "./components/StatesView"
import {StatesVSCodeAPI, UpdateOperationsMessage} from "./states-types"

interface Props {
    readonly vscode: StatesVSCodeAPI
}

export default function StatesApp({vscode}: Props): React.JSX.Element {
    const [operations, setOperations] = useState<OperationNode[]>([])
    const [contracts, setContracts] = useState<
        {address: string; name?: string; sourceMap?: object; abi?: object}[]
    >([])
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
        <StatesView
            operations={operations}
            contracts={contracts}
            onLoadOperations={loadOperations}
            isLoading={isLoading}
            vscode={vscode}
        />
    )
}
