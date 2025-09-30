import React from "react"

import {Input} from "../Input/Input"

import styles from "./FieldInput.module.css"

interface FieldInputProps {
  readonly name: string
  readonly type: string
  readonly value: string
  readonly placeholder?: string
  readonly onChange: (value: string) => void
  readonly disabled?: boolean
  readonly className?: string
}

export const FieldInput: React.FC<FieldInputProps> = ({
  name,
  type,
  value,
  placeholder,
  onChange,
  disabled = false,
  className,
}) => {
  return (
    <div className={`${styles.fieldContainer} ${className ?? ""}`}>
      <div className={styles.fieldHeader}>
        <span className={styles.fieldName}>{name}</span>
        <span className={styles.fieldType}>{type}</span>
      </div>
      <Input
        type="text"
        value={value}
        onChange={e => {
          onChange(e.target.value)
        }}
        placeholder={placeholder ?? `Enter ${name} (${type})`}
        disabled={disabled}
        className={styles.fullWidth}
      />
    </div>
  )
}
