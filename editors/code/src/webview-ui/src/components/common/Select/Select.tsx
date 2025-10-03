import React from "react"

import {Label} from "../Label/Label"

import styles from "./Select.module.css"

// eslint-disable-next-line functional/type-declaration-immutability
interface SelectProps extends Readonly<React.SelectHTMLAttributes<HTMLSelectElement>> {
  readonly variant?: "default" | "error"
  readonly label?: string
  readonly children: React.ReactNode
}

export const Select: React.FC<SelectProps> = ({
  variant = "default",
  label,
  className,
  children,
  id,
  ...props
}) => {
  const selectId = id ?? (label ? `select-${Math.random().toString(36).slice(2, 9)}` : undefined)
  const selectClass = [styles.select, styles[variant], className].filter(Boolean).join(" ")

  const selectElement = (
    <select className={selectClass} id={selectId} {...props}>
      {children}
    </select>
  )

  if (label) {
    return (
      <div className={styles.selectWithLabel}>
        <Label htmlFor={selectId}>{label}</Label>
        {selectElement}
      </div>
    )
  }

  return selectElement
}
