import {useEffect, useState} from "react"

import {VSCodeAPI, Operation} from "../sandbox-actions-types"

import {useContractSelection} from "./useContractSelection"
import {useOperations} from "./useOperations"
import {useContractData} from "./useContractData"
import {useMessageTemplates} from "./useMessageTemplates"
import {useVSCodeMessaging} from "./useVSCodeMessaging"

interface UseActionsAppParams {
  readonly vscode: VSCodeAPI
}

interface UseActionsAppReturn {
  readonly contracts: ReturnType<typeof useContractSelection>["contracts"]
  readonly selectedContract: string
  readonly setSelectedContract: (address: string) => void
  readonly activeOperation: ReturnType<typeof useOperations>["activeOperation"]
  readonly methodId: ReturnType<typeof useOperations>["methodId"]
  readonly results: ReturnType<typeof useOperations>["results"]
  readonly updateResult: ReturnType<typeof useOperations>["updateResult"]
  readonly setActiveOperation: (operation: Operation) => void
  readonly contractAbi: ReturnType<typeof useContractData>["contractAbi"]
  readonly contractInfo: ReturnType<typeof useContractData>["contractInfo"]
  readonly deployState: ReturnType<typeof useContractData>["deployState"]
  readonly messageTemplates: ReturnType<typeof useMessageTemplates>["messageTemplates"]
  readonly isConnected: boolean
  readonly vscode: VSCodeAPI
}

export function useActionsApp({vscode}: UseActionsAppParams): UseActionsAppReturn {
  const contractSelection = useContractSelection()
  const operations = useOperations()
  const contractData = useContractData()
  const messageTemplates = useMessageTemplates()
  const [isConnected, setIsConnected] = useState(false)

  useVSCodeMessaging({
    vscode,
    setContracts: contractSelection.setContracts,
    setActiveOperation: operations.setActiveOperation,
    setMethodId: operations.setMethodId,
    setSelectedContract: contractSelection.setSelectedContract,
    updateResult: operations.updateResult,
    setContractAbi: contractData.setContractAbi,
    setDeployState: contractData.setDeployState,
    setContractInfo: contractData.setContractInfo,
    setMessageTemplates: messageTemplates.setMessageTemplates,
    setIsConnected,
  })

  useEffect(() => {
    if (operations.activeOperation === "compile-deploy") {
      vscode.postMessage({type: "loadAbiForDeploy"})
    }
    if (operations.activeOperation === "contract-info" && contractSelection.selectedContract) {
      vscode.postMessage({
        type: "loadContractInfo",
        contractAddress: contractSelection.selectedContract,
      })
    }
  }, [operations.activeOperation, contractSelection.selectedContract, vscode])

  return {
    // Contract selection
    contracts: contractSelection.contracts,
    selectedContract: contractSelection.selectedContract,
    setSelectedContract: contractSelection.setSelectedContract,

    // Operations
    activeOperation: operations.activeOperation,
    methodId: operations.methodId,
    results: operations.results,
    updateResult: operations.updateResult,
    setActiveOperation: operations.setActiveOperation,

    // Contract data
    contractAbi: contractData.contractAbi,
    contractInfo: contractData.contractInfo,
    deployState: contractData.deployState,

    // Message templates
    messageTemplates: messageTemplates.messageTemplates,

    // Connection status
    isConnected,

    // VSCode communication
    vscode,
  }
}
