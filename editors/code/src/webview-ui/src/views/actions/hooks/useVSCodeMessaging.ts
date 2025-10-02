import {useCallback, useEffect} from "react"

import {ContractAbi} from "@shared/abi"

import {
  VSCodeAPI,
  VSCodeMessage,
  Operation,
  ResultData,
  ContractInfoData,
  MessageTemplate,
  SandboxPersistedState,
  ResultKeys,
} from "../sandbox-actions-types"
import {DeployState} from "../../../../../providers/sandbox/methods"
import {DeployedContract} from "../../../../../common/types/contract"

interface UseVSCodeMessagingParams {
  readonly vscode: VSCodeAPI
  readonly setContracts: (contracts: DeployedContract[]) => void
  readonly setActiveOperation: (operation: Operation) => void
  readonly setMethodId: (methodId: number | undefined) => void
  readonly setSelectedContract: (address: string) => void
  readonly updateResult: (resultId: ResultKeys, result: ResultData | undefined) => void
  readonly setContractAbi: (abi: ContractAbi | undefined) => void
  readonly setDeployState: (state: DeployState | undefined) => void
  readonly setContractInfo: (info: ContractInfoData | undefined) => void
  readonly setMessageTemplates: (templates: MessageTemplate[]) => void
  readonly setIsConnected: (isConnected: boolean) => void
}

interface UseVSCodeMessagingReturn {
  readonly handleMessage: (event: MessageEvent<VSCodeMessage>) => void
}

export function useVSCodeMessaging(params: UseVSCodeMessagingParams): UseVSCodeMessagingReturn {
  const {
    vscode,
    setContracts,
    setActiveOperation,
    setMethodId,
    setSelectedContract,
    updateResult,
    setContractAbi,
    setDeployState,
    setContractInfo,
    setMessageTemplates,
    setIsConnected,
  } = params

  const restoreFromState = useCallback(
    (state: SandboxPersistedState): void => {
      if (state.contracts) {
        setContracts(state.contracts)
      }
      if (state.currentOperation) {
        setActiveOperation(state.currentOperation)
      }
      if (state.selectedContractAddress) {
        setSelectedContract(state.selectedContractAddress)
      }
      if (state.deployAbi) {
        setContractAbi(state.deployAbi)
      }
    },
    [setContracts, setActiveOperation, setSelectedContract, setContractAbi],
  )

  const handleMessage = useCallback(
    (event: MessageEvent<VSCodeMessage>): void => {
      const message: VSCodeMessage = event.data

      switch (message.type) {
        case "updateContracts": {
          setContracts(message.contracts)
          break
        }
        case "showResult": {
          const resultId = message.resultId
          updateResult(resultId, message.result)
          break
        }
        case "openOperation": {
          setActiveOperation(message.operation)
          setMethodId(message.methodId)
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
        case "updateConnectionStatus": {
          setIsConnected(message.isConnected)
          break
        }
        case "restoreState": {
          restoreFromState(message.state)
          break
        }
        case "persistState": {
          vscode.setState(message.state)
          break
        }
      }
    },
    [
      setContracts,
      updateResult,
      setActiveOperation,
      setMethodId,
      setSelectedContract,
      setContractAbi,
      setDeployState,
      setContractInfo,
      vscode,
      setMessageTemplates,
      setIsConnected,
      restoreFromState,
    ],
  )

  useEffect(() => {
    window.addEventListener("message", handleMessage)
    return () => {
      window.removeEventListener("message", handleMessage)
    }
  }, [handleMessage])

  useEffect(() => {
    const savedState = vscode.getState() as SandboxPersistedState | undefined
    if (savedState) {
      restoreFromState(savedState)
    }

    vscode.postMessage({
      type: "webviewReady",
    })
    vscode.postMessage({
      type: "getMessageTemplates",
    })
  }, [vscode, restoreFromState])

  return {
    handleMessage,
  }
}
