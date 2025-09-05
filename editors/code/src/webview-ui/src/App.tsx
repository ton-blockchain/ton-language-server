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
    const [storageAbi, setStorageAbi] = useState<ContractAbi | undefined>()
    const [contractInfo, setContractInfo] = useState<{account: string} | undefined>()

    const [selectedSendContract, setSelectedSendContract] = useState<string>("")
    const [selectedGetContract, setSelectedGetContract] = useState<string>("")
    const [selectedInfoContract, setSelectedInfoContract] = useState<string>("")

    useEffect(() => {
        const handleMessage = (event: MessageEvent): void => {
            const message: VSCodeMessage = event.data as VSCodeMessage

            switch (message.type) {
                case "updateContracts": {
                    setContracts((message.contracts as Contract[] | undefined) ?? [])
                    break
                }
                case "showResult": {
                    const resultId: string = (message.resultId as string | undefined) ?? "default"
                    setResults(prev => ({
                        ...prev,
                        [resultId]: message.result as ResultData,
                    }))
                    break
                }
                case "openOperation": {
                    setActiveOperation(message.operation as Operation)
                    if (message.contractAddress) {
                        switch (message.operation) {
                            case "send-message": {
                                setSelectedSendContract(message.contractAddress as string)
                                break
                            }
                            case "get-method": {
                                setSelectedGetContract(message.contractAddress as string)
                                break
                            }
                            case "contract-info": {
                                setSelectedInfoContract(message.contractAddress as string)
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
                case "updateStorageFields": {
                    setStorageAbi(message.abi as ContractAbi)
                    break
                }
                case "updateContractInfo": {
                    setContractInfo(message.info as {account: string})
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
                        storageAbi={storageAbi}
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
                                ...messageData,
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
                                ...methodData,
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
