import type {ContractABI} from "@ton/core"

import React, {useState, useEffect, useRef} from "react"
import {FiExternalLink} from "react-icons/fi"

import {ExitCodeInfo} from "@shared/abi"

import {Tooltip} from "../../../../components/common/Tooltip"

import styles from "./ExitCodeViewer.module.css"
import {EXIT_CODE_DESCRIPTIONS} from "./error-codes"

interface ExitCodeViewerProps {
  readonly exitCode: number | undefined
  readonly abi: ContractABI | undefined
  readonly exitCodes?: readonly ExitCodeInfo[]
  readonly onOpenFile: (uri: string, row: number, column: number) => void
}

export function ExitCodeChip({
  exitCode,
  abi,
  exitCodes,
  onOpenFile,
}: ExitCodeViewerProps): React.JSX.Element {
  const [showDropdown, setShowDropdown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [showDropdown])

  if (exitCode === undefined) {
    return <span className={styles.exitCode}>—</span>
  }

  const exitCodeInfo = exitCodes?.find(ec => ec.value === exitCode)
  const constantName = exitCodeInfo?.constantName

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const standardDescription = EXIT_CODE_DESCRIPTIONS[
    exitCode as keyof typeof EXIT_CODE_DESCRIPTIONS
  ] ?? {
    name: "Custom error",
    description: "User defined error",
    phase: "Compute phase",
  }
  const abiError = abi?.errors?.[exitCode]

  const displayName = constantName ?? standardDescription.name
  const description = abiError?.message ?? standardDescription.description
  const phase = standardDescription.phase

  const tooltipContent = (
    <div className={styles.tooltipContent}>
      {description && (
        <div className={styles.tooltipSection}>
          <div className={styles.tooltipLabel}>Description:</div>
          <div className={styles.tooltipDescription}>{description}</div>
        </div>
      )}
      <div className={styles.tooltipSection}>
        <div className={styles.tooltipLabel}>Origin:</div>
        <div className={styles.tooltipPhase}>{phase}</div>
      </div>
    </div>
  )

  const isSuccess = exitCode === 0 || exitCode === 1
  const className = `${styles.exitCode} ${isSuccess ? styles.success : styles.error}`

  const usagePositions = exitCodeInfo?.usagePositions ?? []
  const hasUsagePositions = usagePositions.length > 0
  const hasMultiplePositions = usagePositions.length > 1

  const handleFileButtonClick = (e: React.MouseEvent | React.KeyboardEvent): void => {
    e.stopPropagation()
    if (hasMultiplePositions) {
      setShowDropdown(!showDropdown)
    } else if (usagePositions.length === 1) {
      const position = usagePositions[0]
      onOpenFile(position.uri, position.row, position.column)
    }
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <Tooltip content={tooltipContent} variant="hover">
        <span
          className={className}
          onClick={hasUsagePositions ? handleFileButtonClick : undefined}
          onKeyDown={
            hasUsagePositions
              ? e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleFileButtonClick(e)
                  }
                }
              : undefined
          }
          role={hasUsagePositions ? "button" : undefined}
          tabIndex={hasUsagePositions ? 0 : undefined}
          style={hasUsagePositions ? {cursor: "pointer"} : undefined}
        >
          {exitCode}
          {exitCode !== 0 && <span className={styles.exitCodeName}> ({displayName})</span>}
          {hasUsagePositions && (
            <span className={styles.icon}>
              <FiExternalLink size={12} />
            </span>
          )}
        </span>
      </Tooltip>
      {showDropdown && hasMultiplePositions && (
        <div className={styles.dropdown}>
          {usagePositions.map((position, index) => (
            <button
              key={index}
              className={styles.dropdownItem}
              onClick={() => {
                onOpenFile(position.uri, position.row, position.column)
                setShowDropdown(false)
              }}
            >
              <span className={styles.dropdownItemText}>
                {position.uri.split("/").pop()}:{position.row}:{position.column}
              </span>
              <FiExternalLink size={12} className={styles.dropdownItemIcon} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
