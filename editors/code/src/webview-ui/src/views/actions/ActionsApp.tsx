import React, {JSX} from "react"

import {CompileDeploy} from "./components/CompileDeploy/CompileDeploy"
import {SendMessage} from "./components/SendMessage/SendMessage"
import {GetMethod} from "./components/GetMethod/GetMethod"
import {NoOperation} from "./components/NoOperation/NoOperation"
import {ContractInfo} from "./components/ContractInfo/ContractInfo"
import ServerNotConnected from "./components/ServerNotConnected/ServerNotConnected"
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
    methodId,
    setActiveOperation,
    results,
    updateResult,

    // Contract data
    contractAbi, // for deployment
    contractInfo,
    deployState,

    // Message templates
    messageTemplates,

    // Connection status
    isConnected,
  } = useActionsApp({vscode})

  const renderActiveOperation = (): JSX.Element => {
    if (!isConnected) {
      return <ServerNotConnected />
    }

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
            onRedeployByName={(contractName, stateData, value) => {
              vscode.postMessage({
                type: "redeployByName",
                contractName,
                stateData,
                value,
              })
            }}
            result={results["compile-deploy-result"]}
            contractAbi={contractAbi}
            deployState={deployState}
            onResultUpdate={result => {
              updateResult("compile-deploy-result", result)
            }}
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
                debug: messageData.debug,
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
                debug: messageData.debug,
              })
            }}
            handleShowTransactionDetails={tx => {
              vscode.postMessage({
                type: "showTransactionDetails",
                contractAddress: tx.contractAddress,
                methodName: tx.methodName,
                transactionId: tx.transactionId,
                timestamp: tx.timestamp,
                status: "success",
              })
            }}
            result={
              results["send-internal-message-result"] ?? results["send-external-message-result"]
            }
            onResultUpdate={result => {
              updateResult("send-internal-message-result", result)
              updateResult("send-external-message-result", result)
            }}
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
            methodId={methodId}
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
            onResultUpdate={result => {
              updateResult("get-method-result", result)
            }}
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
