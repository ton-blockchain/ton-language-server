import type {Address, ExternalAddress} from "@ton/core"
import React from "react"

export const formatCurrency = (value: bigint | undefined): string => {
  if (value === undefined) return "0 TON"
  if (value === 0n) return "0 TON"

  const numValue = Number(value)
  const displayValue = numValue / 1_000_000_000

  const formatted = displayValue
    .toFixed(9)
    .replace(/(\.\d*[1-9])0+$/, "$1")
    .replace(/\.0+$/, "")

  return `${formatted} TON`
}

export const formatAddress = (
  address: Address | ExternalAddress | string | undefined | null,
): string => {
  if (!address) return "—"
  if (address === "external") return "External"
  return String(address)
}

export const formatBoolean = (v: boolean): React.JSX.Element => {
  return <span className={v ? "booleanTrue" : "booleanFalse"}>{v ? "Yes" : "No"}</span>
}

export const formatNumber = (v: number | bigint | undefined | null): React.JSX.Element => {
  if (v === undefined || v === null) return <span>—</span>
  return <span className="number-value">{v.toString()}</span>
}

export const shortenHash = (hash: string, startChars: number, endChars: number): string => {
  if (!hash) return "—"
  if (hash.length <= startChars + endChars + 3) {
    return hash
  }
  return `${hash.slice(0, Math.max(0, startChars))}...${hash.slice(Math.max(0, hash.length - endChars))}`
}
