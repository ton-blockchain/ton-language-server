export interface OpenFileAtPositionCommand {
  readonly type: "openFileAtPosition"
  readonly uri: string
  readonly row: number
  readonly column: number
}

export type TransactionDetailsCommand = OpenFileAtPositionCommand

export interface VSCodeTransactionDetailsAPI {
  readonly postMessage: (command: TransactionDetailsCommand) => void
  readonly getState: () => unknown
  readonly setState: (state: unknown) => void
}
