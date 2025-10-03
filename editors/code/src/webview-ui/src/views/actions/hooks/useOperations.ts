import {useState, useCallback} from "react"

import {Operation, ResultData, ResultKeys} from "../sandbox-actions-types"

interface UseOperationsReturn {
  readonly activeOperation: Operation
  readonly methodId: number | undefined
  readonly results: Record<ResultKeys, ResultData | undefined>
  readonly setActiveOperation: (operation: Operation) => void
  readonly setMethodId: (methodId: number | undefined) => void
  readonly updateResult: (resultId: string, result: ResultData | undefined) => void
}

export function useOperations(): UseOperationsReturn {
  const [activeOperation, setActiveOperation] = useState<Operation>(null)
  const [methodId, setMethodId] = useState<number | undefined>(undefined)
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
    methodId,
    results,
    setActiveOperation,
    setMethodId,
    updateResult,
  }
}
