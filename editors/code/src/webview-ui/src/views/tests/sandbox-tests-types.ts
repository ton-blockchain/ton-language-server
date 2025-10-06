//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core

import {TestDataMessage} from "../../../../providers/sandbox/test-types"

export interface TestsVSCodeAPI {
  readonly postMessage: (command: TestsCommand) => void
  readonly getState: () => unknown
  readonly setState: (state: unknown) => void
}

export interface AddTestDataCommand {
  readonly type: "addTestData"
  readonly data: TestDataMessage
}

export interface ClearAllTestsCommand {
  readonly type: "clearAllTests"
}

export interface RemoveTestCommand {
  readonly type: "removeTest"
  readonly testId: string
}

export interface ShowTransactionDetailsCommand {
  readonly type: "showTransactionDetails"
  readonly testRunId: string
  readonly transactionId: string
}

export type TestsCommand =
  | AddTestDataCommand
  | ClearAllTestsCommand
  | RemoveTestCommand
  | ShowTransactionDetailsCommand
