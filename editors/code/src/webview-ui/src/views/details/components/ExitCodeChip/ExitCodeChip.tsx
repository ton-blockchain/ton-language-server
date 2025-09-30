import type {ContractABI} from "@ton/core"

import {Tooltip} from "../../../../components/common/Tooltip"

import styles from "./ExitCodeViewer.module.css"
import React from "react"
import {EXIT_CODE_DESCRIPTIONS} from "./error-codes"

interface ExitCodeViewerProps {
    readonly exitCode: number | undefined
    readonly abi?: ContractABI | null
}

export function ExitCodeChip({exitCode, abi}: ExitCodeViewerProps): React.JSX.Element {
    if (exitCode === undefined) {
        return <span className={styles.exitCode}>—</span>
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const standardDescription = EXIT_CODE_DESCRIPTIONS[
        exitCode as keyof typeof EXIT_CODE_DESCRIPTIONS
    ] ?? {
        name: "Custom error",
        description: "User defined error",
        phase: "Compute phase",
    }
    const abiError = abi?.errors?.[exitCode]

    const displayName = standardDescription.name
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

    return (
        <Tooltip content={tooltipContent} variant="hover">
            <span className={className}>
                {exitCode}
                {exitCode !== 0 && <span className={styles.exitCodeName}> ({displayName})</span>}
            </span>
        </Tooltip>
    )
}
