import React, {JSX, useEffect, useState} from "react"
import {CompileDeploy} from "./components/CompileDeploy"
import {SendMessage} from "./components/SendMessage"
import {GetMethod} from "./components/GetMethod"
import {NoOperation} from "./components/NoOperation"
import {Contract, FormData, ResultData, Operation, VSCodeAPI, VSCodeMessage} from "./types"
import {ContractAbi} from "@shared/abi"
import {ContractInfo} from "./components/ContractInfo"

interface Props {
    readonly vscode: VSCodeAPI
}

export default function App({vscode}: Props): JSX.Element {
    const [activeOperation, setActiveOperation] = useState<Operation>(null)
    const [contracts, setContracts] = useState<Contract[]>([])
    const [formData, setFormData] = useState<FormData>({})
    const [results, setResults] = useState<Record<string, ResultData>>({})
    const [storageAbi, setStorageAbi] = useState<ContractAbi | undefined>()
    const [contractInfo, setContractInfo] = useState<{account: string} | undefined>()

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
                    // Auto-hide result after 10 seconds
                    setTimeout(() => {
                        setResults(prev => {
                            const newResults = {...prev}
                            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                            delete newResults[resultId]
                            return newResults
                        })
                    }, 10_000)
                    break
                }
                case "openOperation": {
                    setActiveOperation(message.operation as Operation)
                    if (message.contractAddress) {
                        switch (message.operation) {
                            case "send-message": {
                                setFormData(prev => ({
                                    ...prev,
                                    sendContract: message.contractAddress as string,
                                }))
                                break
                            }
                            case "get-method": {
                                setFormData(prev => ({
                                    ...prev,
                                    getContract: message.contractAddress as string,
                                }))
                                break
                            }
                            case "contract-info": {
                                setFormData(prev => ({
                                    ...prev,
                                    infoContract: message.contractAddress as string,
                                }))
                                break
                            }
                        }
                    } else if (contracts.length > 0) {
                        if (message.operation === "send-message" && !formData.sendContract) {
                            setFormData(prev => ({...prev, sendContract: contracts[0].address}))
                        } else if (message.operation === "get-method" && !formData.getContract) {
                            setFormData(prev => ({...prev, getContract: contracts[0].address}))
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
                case "updateFormData": {
                    setFormData(prev => ({...prev, ...(message.formData as FormData)}))
                    break
                }
            }
        }

        window.addEventListener("message", handleMessage)
        return () => {
            window.removeEventListener("message", handleMessage)
        }
    }, [contracts, formData])

    const updateFormData = (newData: Partial<FormData>): void => {
        const updatedData = {...formData, ...newData}
        setFormData(updatedData)
        vscode.postMessage({
            type: "formDataChanged",
            formData: updatedData,
        })
    }

    const renderActiveOperation = (): JSX.Element => {
        if (!activeOperation) return <NoOperation />

        switch (activeOperation) {
            case "contract-info": {
                return <ContractInfo info={contractInfo} />
            }
            case "compile-deploy": {
                return (
                    <CompileDeploy
                        onCompileAndDeploy={() => {
                            vscode.postMessage({type: "compileAndDeploy"})
                        }}
                        onUpdateStorageFields={fields => {
                            updateFormData({storageFields: fields})
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
                        selectedContract={formData.sendContract}
                        selectedMessage={formData.selectedMessage}
                        messageFields={formData.messageFields}
                        value={formData.value}
                        onContractChange={address => {
                            updateFormData({sendContract: address})
                        }}
                        onMessageChange={message => {
                            updateFormData({selectedMessage: message})
                        }}
                        onMessageFieldChange={fields => {
                            updateFormData({messageFields: fields})
                        }}
                        onValueChange={value => {
                            updateFormData({value})
                        }}
                        onSendMessage={() => {
                            vscode.postMessage({type: "sendMessage", formData})
                        }}
                        result={results["send-message-result"]}
                    />
                )
            }
            case "get-method": {
                return (
                    <GetMethod
                        contracts={contracts}
                        selectedContract={formData.getContract}
                        selectedMethod={formData.selectedMethod}
                        methodId={formData.methodId}
                        onContractChange={address => {
                            updateFormData({getContract: address})
                        }}
                        onMethodChange={method => {
                            updateFormData({selectedMethod: method})
                        }}
                        onMethodIdChange={methodId => {
                            updateFormData({methodId})
                        }}
                        onCallGetMethod={() => {
                            vscode.postMessage({type: "callGetMethod", formData})
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

    // Load ABI when compile-deploy operation is opened
    useEffect(() => {
        if (activeOperation === "compile-deploy") {
            vscode.postMessage({type: "loadAbiForDeploy"})
        }
        if (activeOperation === "contract-info") {
            vscode.postMessage({type: "loadContractInfo"})
        }
    }, [activeOperation, vscode])

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
