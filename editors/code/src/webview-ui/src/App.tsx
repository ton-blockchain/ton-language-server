import React, {useEffect, useState} from "react"
import {CompileDeploy} from "./components/CompileDeploy"
import {SendMessage} from "./components/SendMessage"
import {GetMethod} from "./components/GetMethod"
import {NoOperation} from "./components/NoOperation"
import {Contract, FormData, ResultData, Operation, VSCodeAPI, VSCodeMessage} from "./types"
import {ContractAbi} from "@shared/abi"

interface Props {
    readonly vscode: VSCodeAPI
}

export default function App({vscode}: Props) {
    const [activeOperation, setActiveOperation] = useState<Operation>(null)
    const [contracts, setContracts] = useState<Contract[]>([])
    const [formData, setFormData] = useState<FormData>({})
    const [results, setResults] = useState<Record<string, ResultData>>({})
    const [storageAbi, setStorageAbi] = useState<ContractAbi | undefined>()

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message: VSCodeMessage = event.data

            switch (message.type) {
                case "updateContracts": {
                    setContracts(message.contracts ?? [])
                    break
                }
                case "showResult": {
                    const resultId = message.resultId || "default"
                    setResults(prev => ({
                        ...prev,
                        [resultId]: message.result,
                    }))
                    // Auto-hide result after 10 seconds
                    setTimeout(() => {
                        setResults(prev => {
                            const newResults = {...prev}
                            delete newResults[resultId]
                            return newResults
                        })
                    }, 10_000)
                    break
                }
                case "openOperation": {
                    setActiveOperation(message.operation)
                    if (message.contractAddress) {
                        if (message.operation === "send-message") {
                            setFormData(prev => ({...prev, sendContract: message.contractAddress}))
                        } else if (message.operation === "get-method") {
                            setFormData(prev => ({...prev, getContract: message.contractAddress}))
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
                    setStorageAbi(message.abi)
                    break
                }
                case "updateFormData": {
                    setFormData(prev => ({...prev, ...message.formData}))
                    break
                }
            }
        }

        window.addEventListener("message", handleMessage)
        return () => {
            window.removeEventListener("message", handleMessage)
        }
    }, [contracts, formData])

    const updateFormData = (newData: Partial<FormData>) => {
        const updatedData = {...formData, ...newData}
        setFormData(updatedData)
        vscode.postMessage({
            type: "formDataChanged",
            formData: updatedData,
        })
    }

    const renderActiveOperation = () => {
        if (!activeOperation) return <NoOperation />

        switch (activeOperation) {
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
