import {useState, useCallback} from "react"

import {Operation, ResultData} from "../sandbox-actions-types"

type ResultKeys =
  | "compile-deploy-result"
  | "send-internal-message-result"
  | "send-external-message-result"
  | "get-method-result"

interface UseOperationsReturn {
  readonly activeOperation: Operation
  readonly results: Record<ResultKeys, ResultData | undefined>
  readonly setActiveOperation: (operation: Operation) => void
  readonly updateResult: (resultId: string, result: ResultData) => void
}

export function useOperations(): UseOperationsReturn {
  const [activeOperation, setActiveOperation] = useState<Operation>(null)
  const [results, setResults] = useState<Record<ResultKeys, ResultData | undefined>>({
    "compile-deploy-result": undefined,
    "get-method-result": undefined,
    "send-external-message-result": undefined,
    "send-internal-message-result": undefined,
  })

  const updateResult = useCallback((resultId: string, result: ResultData) => {
    setResults(prev => ({
      ...prev,
      [resultId]: result,
    }))
  }, [])

  return {
    activeOperation,
    results,
    setActiveOperation,
    updateResult,
  }
}
