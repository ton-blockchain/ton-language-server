//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import React, {useCallback, useEffect, useState} from "react"

import {useTestsApp} from "../hooks/useTestsApp"

import styles from "../TestsApp.module.css"
import {TestDataMessage} from "../../../../../providers/sandbox/test-types"

interface TestsViewProps {
  readonly messages: readonly {type: string; data?: TestDataMessage}[]
  readonly onClearAllTests: () => void
  readonly onRemoveTest: (testId: string) => void
}

export function TestsView({
  messages,
  onClearAllTests,
  onRemoveTest,
}: TestsViewProps): React.JSX.Element {
  const {testRuns, addTestData} = useTestsApp()
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set())

  // Обработка входящих сообщений
  useEffect(() => {
    messages.forEach(message => {
      if (message.type === "addTestData" && message.data) {
        addTestData(message.data)
      }
    })
  }, [messages, addTestData])

  const toggleTestExpansion = useCallback((testId: string) => {
    setExpandedTests(prev => {
      const newSet = new Set(prev)
      if (newSet.has(testId)) {
        newSet.delete(testId)
      } else {
        newSet.add(testId)
      }
      return newSet
    })
  }, [])

  const handleTransactionClick = useCallback((testRunId: string, transactionId: string) => {
    // Отправляем сообщение в extension для открытия деталей транзакции
    // vscode API будет передан через контекст или пропс в будущем
    console.log("Show transaction details:", testRunId, transactionId)
  }, [])

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Test Results</h2>
      </div>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary}`}
          onClick={onClearAllTests}
          disabled={testRuns.length === 0}
        >
          Clear All
        </button>
        <span>
          {testRuns.length} test run{testRuns.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className={styles.content}>
        {testRuns.length === 0 ? (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              color: "var(--vscode-descriptionForeground)",
            }}
          >
            No test runs yet. Run your tests to see results here.
          </div>
        ) : (
          testRuns.map(testRun => (
            <div key={testRun.id}>
              <div
                className={styles.testItem}
                onClick={() => {
                  toggleTestExpansion(testRun.id)
                }}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    toggleTestExpansion(testRun.id)
                  }
                }}
              >
                <span
                  className={`codicon codicon-chevron-${expandedTests.has(testRun.id) ? "down" : "right"} ${styles.testIcon}`}
                />
                <div className={styles.testInfo}>
                  <div className={styles.testName}>{testRun.name}</div>
                  <div className={styles.testTime}>
                    {new Date(testRun.timestamp).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.button}
                  onClick={e => {
                    e.stopPropagation()
                    onRemoveTest(testRun.id)
                  }}
                  title="Remove test run"
                >
                  ×
                </button>
              </div>

              {expandedTests.has(testRun.id) && (
                <div>
                  {testRun.transactions.map(transaction => (
                    <div
                      key={transaction.transaction.lt}
                      className={styles.transactionItem}
                      onClick={() => {
                        handleTransactionClick(testRun.id, transaction.transaction.lt.toString())
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                          handleTransactionClick(testRun.id, transaction.transaction.lt.toString())
                        }
                      }}
                    >
                      <span
                        className={`codicon codicon-check ${styles.transactionIcon}`}
                        style={{
                          color: "var(--vscode-charts-green)",
                        }}
                      />
                      <div className={styles.transactionInfo}>
                        <div className={styles.transactionAddress}>
                          {transaction.address?.toString()}
                        </div>
                        <div className={styles.transactionLt}>
                          LT: {transaction.transaction.lt.toString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
