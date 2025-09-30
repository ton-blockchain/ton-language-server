import React from "react"
import styles from "./NoOperation.module.css"

export const NoOperation: React.FC = () => {
  return (
    <div className={styles.noOperation}>
      <p>Select an operation from the tree to get started:</p>
      <ul>
        <li>
          🚀 <strong>Compile & Deploy</strong> - Deploy contracts from editor
        </li>
        <li>
          📤 <strong>Send Message</strong> - Send messages to deployed contracts
        </li>
        <li>
          🔍 <strong>Call Get Method</strong> - Call get methods on contracts
        </li>
      </ul>
    </div>
  )
}
