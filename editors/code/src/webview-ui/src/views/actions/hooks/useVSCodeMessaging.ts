import {useCallback, useEffect} from "react"

import {ContractAbi} from "@shared/abi"

import {
  VSCodeAPI,
  VSCodeMessage,
  Operation,
  ResultData,
  ContractInfoData,
  MessageTemplate,
} from "../sandbox-actions-types"
import {DeployState} from "../../../../../providers/sandbox/methods"
import {DeployedContract} from "../../../../../common/types/contract"

interface UseVSCodeMessagingParams {
  readonly vscode: VSCodeAPI
  readonly setContracts: (contracts: DeployedContract[]) => void
  readonly setActiveOperation: (operation: Operation) => void
  readonly setSelectedContract: (address: string) => void
  readonly updateResult: (resultId: string, result: ResultData) => void
  readonly setContractAbi: (abi: ContractAbi | undefined) => void
  readonly setDeployState: (state: DeployState | null) => void
  readonly setContractInfo: (info: ContractInfoData | undefined) => void
  readonly setLoadedTemplate: (template: MessageTemplate | null) => void
  readonly setMessageTemplates: (templates: MessageTemplate[]) => void
}

interface UseVSCodeMessagingReturn {
  readonly handleMessage: (event: MessageEvent<VSCodeMessage>) => void
}

export function useVSCodeMessaging(params: UseVSCodeMessagingParams): UseVSCodeMessagingReturn {
  const {
    vscode,
    setContracts,
    setActiveOperation,
    setSelectedContract,
    updateResult,
    setContractAbi,
    setDeployState,
    setContractInfo,
    setLoadedTemplate,
    setMessageTemplates,
  } = params

  const handleMessage = useCallback(
    (event: MessageEvent<VSCodeMessage>): void => {
      const message: VSCodeMessage = event.data

      switch (message.type) {
        case "updateContracts": {
          setContracts(message.contracts)
          break
        }
        case "showResult": {
          const resultId = message.resultId ?? "default"
          updateResult(resultId, message.result)
          break
        }
        case "openOperation": {
          setActiveOperation(message.operation)
          if (message.contractAddress) {
            setSelectedContract(message.contractAddress)
          }
          break
        }
        case "updateContractAbi": {
          setContractAbi(message.abi)
          break
        }
        case "updateDeployState": {
          setDeployState(message.state)
          if (message.abi) {
            setContractAbi(message.abi)
          }
          break
        }
        case "updateContractInfo": {
          setContractInfo(message.info)
          break
        }
        case "updateActiveEditor": {
          vscode.postMessage({
            type: "loadAbiForDeploy",
          })
          break
        }
        case "messageTemplate": {
          setLoadedTemplate(message.template)
          setActiveOperation("send-message")
          break
        }
        case "templateCreated": {
          vscode.postMessage({type: "getMessageTemplates"})
          break
        }
        case "templateUpdated": {
          vscode.postMessage({type: "getMessageTemplates"})
          break
        }
        case "templateDeleted": {
          vscode.postMessage({type: "getMessageTemplates"})
          break
        }
        case "messageTemplates": {
          setMessageTemplates(message.templates)
          break
        }
      }
    },
    [
      vscode,
      setContracts,
      setActiveOperation,
      setSelectedContract,
      updateResult,
      setContractAbi,
      setDeployState,
      setContractInfo,
      setLoadedTemplate,
      setMessageTemplates,
    ],
  )

  useEffect(() => {
    window.addEventListener("message", handleMessage)
    return () => {
      window.removeEventListener("message", handleMessage)
    }
  }, [handleMessage])

  useEffect(() => {
    vscode.postMessage({
      type: "webviewReady",
    })
    vscode.postMessage({
      type: "getMessageTemplates",
    })
  }, [vscode])

  return {
    handleMessage,
  }
}
