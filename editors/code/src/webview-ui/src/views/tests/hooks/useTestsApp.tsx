//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import React, {createContext, ReactNode, useCallback, useContext, useMemo, useState} from "react"

import {
  processTxString,
  TestDataMessage,
  TestRun,
} from "../../../../../providers/sandbox/test-types"

interface TestsAppContextValue {
  readonly testRuns: readonly TestRun[]
  readonly addTestData: (data: TestDataMessage) => void
  readonly clearAllTests: () => void
  readonly removeTest: (testId: string) => void
}

const TestsAppContext = createContext<TestsAppContextValue | null>(null)

export function TestsAppProvider({children}: {children: ReactNode}): React.JSX.Element {
  const [testRuns, setTestRuns] = useState<readonly TestRun[]>([])

  const addTestData = useCallback((data: TestDataMessage) => {
    const testRun: TestRun = {
      id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      name: data.testName,
      timestamp: Date.now(),
      transactions: processTxString(data.transactions),
      contracts: data.contracts,
      changes: data.changes,
      resultString: data.transactions,
    }

    setTestRuns(prev => [testRun, ...prev.slice(0, 49)]) // Ограничиваем до 50 тестов
  }, [])

  const clearAllTests = useCallback(() => {
    setTestRuns([])
  }, [])

  const removeTest = useCallback((testId: string) => {
    setTestRuns(prev => prev.filter(run => run.id !== testId))
  }, [])

  const value = useMemo(
    () => ({
      testRuns,
      addTestData,
      clearAllTests,
      removeTest,
    }),
    [testRuns, addTestData, clearAllTests, removeTest],
  )

  return <TestsAppContext.Provider value={value}>{children}</TestsAppContext.Provider>
}

export function useTestsApp(): TestsAppContextValue {
  const context = useContext(TestsAppContext)
  if (!context) {
    throw new Error("useTestsApp must be used within TestsAppProvider")
  }
  return context
}
