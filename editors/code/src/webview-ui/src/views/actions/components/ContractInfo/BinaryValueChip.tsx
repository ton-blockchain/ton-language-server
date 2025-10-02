import React, {useState, useCallback, useEffect, useMemo} from "react"
import {Slice} from "@ton/core"

import styles from "./BinaryValueChip.module.css"

interface BinaryValueChipProps {
  readonly value: Slice
  readonly title?: string
}

export function BinaryValueChip({value, title}: BinaryValueChipProps): React.JSX.Element {
  const [isCopied, setIsCopied] = useState(false)
  const [showAsText, setShowAsText] = useState(false)

  const hexValue = useMemo(() => value.asCell().toBoc().toString("hex"), [value])

  const textValue = useMemo(() => {
    try {
      const buffer = value.clone().loadBuffer(value.remainingBits / 8)
      return buffer.toString("utf8")
    } catch (error) {
      return error instanceof Error ? error.message : "Error decoding value"
    }
  }, [value])

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      navigator.clipboard
        .writeText(showAsText ? textValue : hexValue)
        .then(() => {
          setIsCopied(true)
        })
        .catch((error: unknown) => {
          console.error("Failed to copy:", error)
        })
    },
    [hexValue, textValue, showAsText],
  )

  const handleToggleView = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setShowAsText(!showAsText)
    },
    [showAsText],
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

  const displayValue = showAsText ? textValue : hexValue
  const truncatedValue = displayValue.length > 32 ? displayValue.slice(0, 32) + "..." : displayValue

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

  const textIconSvg = (
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14,2 14,8 20,8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10,9 9,9 8,9"></polyline>
    </svg>
  )

  const hexIconSvg = (
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
      <path d="M10 16V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2Z"></path>
      <path d="M2 12h6"></path>
      <path d="M5 9v6"></path>
    </svg>
  )

  return (
    <span className={styles.binaryValueChip} title={title}>
      <span className={styles.value} title={displayValue}>
        {truncatedValue}
      </span>
      <div className={styles.controls}>
        <button
          onClick={handleToggleView}
          className={styles.controlButton}
          title={showAsText ? "Show as hex" : "Show as text"}
          type="button"
        >
          {showAsText ? hexIconSvg : textIconSvg}
        </button>
        <button
          onClick={handleCopy}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              handleCopy(e as unknown as React.MouseEvent)
            }
          }}
          className={styles.controlButton}
          title={isCopied ? "Copied!" : `Copy ${showAsText ? "text" : "hex"}`}
          type="button"
        >
          {isCopied ? checkIconSvg : copyIconSvg}
        </button>
      </div>
    </span>
  )
}
