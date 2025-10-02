import React, {JSX} from "react"

import styles from "./ServerNotConnected.module.css"

export default function ServerNotConnected(): JSX.Element {
  return (
    <div className={styles.container}>
      <div className={styles.icon}>🔌</div>
      <p className={styles.title}>Sandbox Server Not Connected</p>
      <p className={styles.message}>
        The TON Sandbox server is not running. Use the view above to start the server.
      </p>
    </div>
  )
}
