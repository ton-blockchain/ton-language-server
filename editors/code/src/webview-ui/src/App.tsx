import React, {JSX, useEffect, useState, useCallback} from "react"
import {CompileDeploy} from "./components/CompileDeploy"
import {SendMessage} from "./components/SendMessage"
import {GetMethod} from "./components/GetMethod"
import {NoOperation} from "./components/NoOperation"
import {Contract, ResultData, Operation, VSCodeAPI, VSCodeMessage, ContractInfoData} from "./types"
import {ContractAbi} from "@shared/abi"
import {ContractInfo} from "./components/ContractInfo"

interface Props {
    readonly vscode: VSCodeAPI
}

export default function App({vscode}: Props): JSX.Element {
    const [activeOperation, setActiveOperation] = useState<Operation>(null)
    const [contracts, setContracts] = useState<Contract[]>([])
    const [results, setResults] = useState<Record<string, ResultData | undefined>>({})
    const [contractAbi, setContractAbi] = useState<ContractAbi | undefined>()
    const [contractInfo, setContractInfo] = useState<ContractInfoData | undefined>()

    const [selectedSendContract, setSelectedSendContract] = useState<string>("")
    const [selectedGetContract, setSelectedGetContract] = useState<string>("")
    const [selectedInfoContract, setSelectedInfoContract] = useState<string>("")

    const clearSendResults = useCallback(() => {
        setResults(prev => ({
            ...prev,
            "send-external-message-result": undefined,
            "send-internal-message-result": undefined,
        }))
    }, [])

    const handleMessage = useCallback((event: MessageEvent<VSCodeMessage>): void => {
        const message: VSCodeMessage = event.data

        switch (message.type) {
            case "updateContracts": {
                setContracts(message.contracts)
                break
            }
            case "showResult": {
                const resultId = message.resultId ?? "default"
                setResults(prev => ({
                    ...prev,
                    [resultId]: message.result,
                }))
                break
            }
            case "openOperation": {
                setActiveOperation(message.operation)
                if (message.contractAddress) {
                    switch (message.operation) {
                        case "send-message": {
                            setSelectedSendContract(message.contractAddress)
                            break
                        }
                        case "get-method": {
                            setSelectedGetContract(message.contractAddress)
                            break
                        }
                        case "contract-info": {
                            setSelectedInfoContract(message.contractAddress)
                            break
                        }
                        case "compile-deploy":
                        case null: {
                            // No contract address needed for these operations
                            break
                        }
                    }
                }
                break
            }
            case "updateContractAbi": {
                setContractAbi(message.abi)
                break
            }
            case "updateContractInfo": {
                setContractInfo(message.info)
                break
            }
            case "updateActiveEditor": {
                if (message.document && message.document.languageId === "tolk") {
                    vscode.postMessage({
                        type: "loadAbiForDeploy",
                    })
                }
                break
            }
        }
    }, [])

    useEffect(() => {
        vscode.postMessage({
            type: "webviewReady",
        })
    }, [])

    useEffect(() => {
        window.addEventListener("message", handleMessage)
        return () => {
            window.removeEventListener("message", handleMessage)
        }
    }, [handleMessage])

    const renderActiveOperation = (): JSX.Element => {
        if (!activeOperation) return <NoOperation />

        switch (activeOperation) {
            case "contract-info": {
                return (
                    <ContractInfo
                        info={contractInfo}
                        contractAddress={selectedInfoContract}
                        contracts={contracts}
                        onSendMessage={() => {
                            setSelectedSendContract(selectedInfoContract)
                            setActiveOperation("send-message")
                        }}
                        onCallGetMethod={() => {
                            setSelectedGetContract(selectedInfoContract)
                            setActiveOperation("get-method")
                        }}
                        vscode={vscode}
                    />
                )
            }
            case "compile-deploy": {
                return (
                    <CompileDeploy
                        onCompileAndDeploy={(storageFields, value, contractName) => {
                            vscode.postMessage({
                                type: "compileAndDeploy",
                                name: contractName ?? contractAbi?.name ?? "UnknownContract",
                                storageFields,
                                value,
                            })
                        }}
                        result={results["compile-deploy-result"]}
                        contractAbi={contractAbi}
                    />
                )
            }
            case "send-message": {
                return (
                    <SendMessage
                        contracts={contracts}
                        selectedContract={selectedSendContract}
                        onContractChange={setSelectedSendContract}
                        onSendMessage={messageData => {
                            vscode.postMessage({
                                type: "sendExternalMessage",
                                contractAddress: selectedSendContract,
                                selectedMessage: messageData.selectedMessage,
                                messageFields: messageData.messageFields,
                                autoDebug: messageData.autoDebug,
                            })
                        }}
                        onSendInternalMessage={messageData => {
                            vscode.postMessage({
                                type: "sendInternalMessage",
                                fromAddress: messageData.fromAddress,
                                toAddress: selectedSendContract,
                                selectedMessage: messageData.selectedMessage,
                                messageFields: messageData.messageFields,
                                sendMode: messageData.sendMode ?? 0,
                                value: messageData.value ?? "1.0",
                                autoDebug: messageData.autoDebug,
                            })
                        }}
                        handleShowTransactionDetails={tx => {
                            vscode.postMessage({
                                type: "showTransactionDetails",
                                contractAddress: tx.contractAddress,
                                methodName: tx.methodName,
                                transactionId: tx.transactionId,
                                timestamp: tx.timestamp,
                            })
                        }}
                        result={
                            results["send-internal-message-result"] ??
                            results["send-external-message-result"]
                        }
                        onClearResult={clearSendResults}
                    />
                )
            }
            case "get-method": {
                return (
                    <GetMethod
                        contracts={contracts}
                        selectedContract={selectedGetContract}
                        onContractChange={setSelectedGetContract}
                        onCallGetMethod={methodData => {
                            vscode.postMessage({
                                type: "callGetMethod",
                                contractAddress: selectedGetContract,
                                selectedMethod: methodData.selectedMethod,
                                methodId: methodData.methodId,
                            })
                        }}
                        result={results["get-method-result"]}
                    />
                )
            }
            default: {
                return <NoOperation />
            }
        }
    }

    useEffect(() => {
        if (activeOperation === "compile-deploy") {
            vscode.postMessage({type: "loadAbiForDeploy"})
        }
        if (activeOperation === "contract-info" && selectedInfoContract) {
            setContractInfo(undefined)
            vscode.postMessage({
                type: "loadContractInfo",
                contractAddress: selectedInfoContract,
            })
        }
    }, [activeOperation, selectedInfoContract, vscode])

    return (
        <div
            style={{
                fontFamily: "var(--vscode-font-family)",
                fontSize: "var(--vscode-font-size)",
                color: "var(--vscode-foreground)",
                backgroundColor: "var(--vscode-sideBar-background)",
                height: "100vh",
                overflow: "auto",
            }}
        >
            {renderActiveOperation()}
        </div>
    )
}
