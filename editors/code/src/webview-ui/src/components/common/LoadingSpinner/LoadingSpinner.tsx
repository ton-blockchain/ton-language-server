import React from "react"

import styles from "./LoadingSpinner.module.css"

interface LoadingSpinnerProps {
  readonly message?: string
  readonly subtext?: string
  readonly loading?: boolean
  readonly className?: string
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = "Loading",
  subtext,
  loading = true,
  className,
}) => (
  <div
    className={`${styles.spinnerContainer} ${loading ? "" : styles.hidden} ${className ?? ""}`}
    role="status"
    aria-live="polite"
    aria-hidden={!loading}
  >
    <div className={styles.spinnerWrapper}>
      <div className={styles.spinner} />
      <div className={styles.spinnerGlow} />
    </div>
    {message && <div className={styles.loadingText}>{message}</div>}
    {subtext && (
      <div className={styles.loadingSubtext}>
        <span>{subtext}</span>
        <span className={styles.dotAnimation}>
          <span className={styles.dot}>.</span>
          <span className={styles.dot}>.</span>
          <span className={styles.dot}>.</span>
        </span>
      </div>
    )}
  </div>
)
