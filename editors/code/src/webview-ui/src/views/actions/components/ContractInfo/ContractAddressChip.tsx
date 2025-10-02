import React, {useState, useCallback, useEffect} from "react"

import {DeployedContract} from "../../../../../../common/types/contract"

import styles from "./ContractAddressChip.module.css"

interface ContractAddressChipProps {
  readonly address: string
  readonly contracts: DeployedContract[]
}

export function ContractAddressChip({
  address,
  contracts,
}: ContractAddressChipProps): React.JSX.Element {
  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      navigator.clipboard
        .writeText(address)
        .then(() => {
          setIsCopied(true)
        })
        .catch((error: unknown) => {
          console.error("Failed to copy:", error)
        })
    },
    [address],
  )

  useEffect((): (() => void) | undefined => {
    if (isCopied) {
      const timer = setTimeout(() => {
        setIsCopied(false)
      }, 1500)
      return () => {
        clearTimeout(timer)
      }
    }
    return undefined
  }, [isCopied])

  const contractInfo = contracts.find(c => c.address === address)

  const copyIconSvg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  )

  const checkIconSvg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  )

  return (
    <span className={styles.contractAddressChip}>
      {contractInfo ? (
        <>
          <span className={styles.contractName}>{contractInfo.name}</span>
          <span className={styles.contractAddress}>
            ({address.slice(0, 6)}…{address.slice(-6)})
          </span>
        </>
      ) : (
        <span className={styles.contractAddressOnly}>
          {address.slice(0, 6)}…{address.slice(-6)}
        </span>
      )}
      <button
        onClick={handleCopy}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleCopy(e as unknown as React.MouseEvent)
          }
        }}
        className={styles.copyButton}
        title={isCopied ? "Copied!" : "Copy address"}
        aria-label={isCopied ? "Copied to clipboard" : "Copy address"}
        type="button"
      >
        {isCopied ? checkIconSvg : copyIconSvg}
      </button>
    </span>
  )
}
