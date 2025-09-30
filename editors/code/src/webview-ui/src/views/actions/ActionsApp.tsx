import React, {JSX} from "react"

import {CompileDeploy} from "./components/CompileDeploy/CompileDeploy"
import {SendMessage} from "./components/SendMessage/SendMessage"
import {GetMethod} from "./components/GetMethod/GetMethod"
import {NoOperation} from "./components/NoOperation/NoOperation"
import {ContractInfo} from "./components/ContractInfo/ContractInfo"
import {VSCodeAPI} from "./sandbox-actions-types"
import {useActionsApp} from "./hooks/useActionsApp"

import styles from "./ActionsApp.module.css"

interface Props {
  readonly vscode: VSCodeAPI
}

export default function ActionsApp({vscode}: Props): JSX.Element {
  const {
    // Contract selection
    contracts,
    selectedContract,
    setSelectedContract,

    // Operations
    activeOperation,
    setActiveOperation,
    results,

    // Contract data
    contractAbi, // for deployment
    contractInfo,
    deployState,

    // Message templates
    loadedTemplate,
    messageTemplates,
  } = useActionsApp({vscode})

  const renderActiveOperation = (): JSX.Element => {
    if (!activeOperation) return <NoOperation />

    switch (activeOperation) {
      case "contract-info": {
        return (
          <ContractInfo
            info={contractInfo}
            contractAddress={selectedContract}
            contracts={contracts}
            onSendMessage={() => {
              setActiveOperation("send-message")
            }}
            onCallGetMethod={() => {
              setActiveOperation("get-method")
            }}
            vscode={vscode}
          />
        )
      }
      case "compile-deploy": {
        return (
          <CompileDeploy
            contracts={contracts}
            onCompileAndDeploy={(stateData, value, name, storageType) => {
              vscode.postMessage({
                type: "compileAndDeploy",
                name,
                stateData,
                value,
                storageType,
              })
            }}
            result={results["compile-deploy-result"]}
            contractAbi={contractAbi}
            deployState={deployState}
          />
        )
      }
      case "send-message": {
        return (
          <SendMessage
            contracts={contracts}
            selectedContract={selectedContract}
            onContractChange={setSelectedContract}
            onSendMessage={messageData => {
              vscode.postMessage({
                type: "sendExternalMessage",
                contractAddress: selectedContract,
                selectedMessage: messageData.selectedMessage,
                messageBody: messageData.messageBody,
                autoDebug: messageData.autoDebug,
              })
            }}
            onSendInternalMessage={messageData => {
              vscode.postMessage({
                type: "sendInternalMessage",
                fromAddress: messageData.fromAddress,
                toAddress: selectedContract,
                selectedMessage: messageData.selectedMessage,
                messageBody: messageData.messageBody,
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
              results["send-internal-message-result"] ?? results["send-external-message-result"]
            }
            loadedTemplate={loadedTemplate}
            messageTemplates={messageTemplates}
            vscode={vscode}
          />
        )
      }
      case "get-method": {
        return (
          <GetMethod
            contracts={contracts}
            selectedContract={selectedContract}
            onContractChange={setSelectedContract}
            onCallGetMethod={methodData => {
              vscode.postMessage({
                type: "callGetMethod",
                contractAddress: selectedContract,
                selectedMethod: methodData.selectedMethod,
                methodId: methodData.methodId,
                parameters: methodData.parameters,
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

  return <div className={styles.container}>{renderActiveOperation()}</div>
}
