import React, {JSX, useEffect, useState} from "react"
import {CompileDeploy} from "./components/CompileDeploy"
import {SendMessage} from "./components/SendMessage"
import {GetMethod} from "./components/GetMethod"
import {NoOperation} from "./components/NoOperation"
import {Contract, ResultData, Operation, VSCodeAPI, VSCodeMessage} from "./types"
import {ContractAbi} from "@shared/abi"
import {ContractInfo} from "./components/ContractInfo"

interface Props {
    readonly vscode: VSCodeAPI
}

export default function App({vscode}: Props): JSX.Element {
    const [activeOperation, setActiveOperation] = useState<Operation>(null)
    const [contracts, setContracts] = useState<Contract[]>([])
    const [results, setResults] = useState<Record<string, ResultData>>({})
    const [contractAbi, setContractAbi] = useState<ContractAbi | undefined>()
    const [contractInfo, setContractInfo] = useState<{account: string} | undefined>()

    const [selectedSendContract, setSelectedSendContract] = useState<string>("")
    const [selectedGetContract, setSelectedGetContract] = useState<string>("")
    const [selectedInfoContract, setSelectedInfoContract] = useState<string>("")

    useEffect(() => {
        const handleMessage = (event: MessageEvent<VSCodeMessage>): void => {
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
                    } else if (contracts.length > 0) {
                        if (message.operation === "send-message" && !selectedSendContract) {
                            setSelectedSendContract(contracts[0].address)
                        } else if (message.operation === "get-method" && !selectedGetContract) {
                            setSelectedGetContract(contracts[0].address)
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
            }
        }

        window.addEventListener("message", handleMessage)
        return () => {
            window.removeEventListener("message", handleMessage)
        }
    }, [contracts, selectedSendContract, selectedGetContract, selectedInfoContract])

    const renderActiveOperation = (): JSX.Element => {
        if (!activeOperation) return <NoOperation />

        switch (activeOperation) {
            case "contract-info": {
                return (
                    <ContractInfo
                        info={contractInfo}
                        contractAddress={selectedInfoContract}
                        onSendMessage={() => {
                            setSelectedSendContract(selectedInfoContract)
                            setActiveOperation("send-message")
                        }}
                        onCallGetMethod={() => {
                            setSelectedGetContract(selectedInfoContract)
                            setActiveOperation("get-method")
                        }}
                    />
                )
            }
            case "compile-deploy": {
                return (
                    <CompileDeploy
                        onCompileAndDeploy={storageFields => {
                            vscode.postMessage({
                                type: "compileAndDeploy",
                                storageFields,
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
                                type: "sendMessage",
                                contractAddress: selectedSendContract,
                                selectedMessage: messageData.selectedMessage,
                                messageFields: messageData.messageFields,
                                value: messageData.value,
                            })
                        }}
                        result={results["send-message-result"]}
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
