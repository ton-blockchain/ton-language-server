import styles from "./ReserveModeViewer.module.css"
import React from "react"
import {parseReserveMode} from "../../../../../../providers/lib/transaction"
import {Tooltip} from "../../../../components/common/Tooltip"

interface ReserveModeViewerProps {
  readonly mode: number | undefined
}

export function ReserveModeViewer({mode}: ReserveModeViewerProps): React.JSX.Element {
  if (mode === undefined) {
    return <span className={styles.empty}>No mode</span>
  }

  const flags = parseReserveMode(mode)

  if (flags.length === 0) {
    return <span className={styles.empty}>Unknown mode: {mode}</span>
  }

  return (
    <div className={styles.container}>
      {flags.map((flag, index) => (
        <div key={flag.value}>
          {index > 0 && <span className={styles.plus}> + </span>}
          <Tooltip content={flag.description} enableMarkdown={true}>
            <span className={styles.constant}>
              {flag.name} ({flag.value})
            </span>
          </Tooltip>
        </div>
      ))}
    </div>
  )
}
