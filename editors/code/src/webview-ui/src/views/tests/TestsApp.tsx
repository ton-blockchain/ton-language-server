//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import React, {useCallback, useEffect, useState} from "react"

import {TestDataMessage} from "../../../../providers/sandbox/test-types"

import {TestsView} from "./components/TestsView"
import {TestsAppProvider} from "./hooks/useTestsApp"
import {TestsVSCodeAPI, TestsCommand} from "./sandbox-tests-types"

import "./TestsApp.module.css"

interface TestsMessage {
  readonly type: "addTestData"
  readonly data: TestDataMessage
}

interface TestsAppProps {
  readonly vscode: TestsVSCodeAPI
}

export function TestsApp({vscode}: TestsAppProps): React.JSX.Element {
  const [messages, setMessages] = useState<readonly TestsMessage[]>([])

  const postMessage = useCallback(
    (message: TestsCommand) => {
      vscode.postMessage(message)
    },
    [vscode],
  )

  useEffect(() => {
    const handler = (event: MessageEvent): void => {
      const message = event.data as TestsMessage
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (message.type === "addTestData") {
        setMessages(prev => [...prev, message])
      }
    }

    window.addEventListener("message", handler)
    return () => {
      window.removeEventListener("message", handler)
    }
  }, [])

  const handleClearAllTests = useCallback(() => {
    postMessage({type: "clearAllTests"})
  }, [postMessage])

  const handleRemoveTest = useCallback(
    (testId: string) => {
      postMessage({type: "removeTest", testId})
    },
    [postMessage],
  )

  return (
    <TestsAppProvider>
      <TestsView
        messages={messages}
        onClearAllTests={handleClearAllTests}
        onRemoveTest={handleRemoveTest}
      />
    </TestsAppProvider>
  )
}
