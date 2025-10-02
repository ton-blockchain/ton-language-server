import React, {useState, useEffect} from "react"

import {Input} from "../Input/Input"

import styles from "./CoinsInput.module.css"

interface CoinsInputProps {
  readonly label?: string
  readonly value?: string
  readonly onChange: (value: string, mode: "ton" | "raw") => void
  readonly placeholder?: string
  readonly required?: boolean
  readonly className?: string
  readonly error?: string
  readonly defaultMode?: "ton" | "raw"
}

function parseStoredValue(storedValue: string): {value: string; mode: "ton" | "raw"} {
  const separatorIndex = storedValue.lastIndexOf("|")
  if (separatorIndex !== -1) {
    const value = storedValue.slice(0, Math.max(0, separatorIndex))
    const mode = storedValue.slice(Math.max(0, separatorIndex + 1))
    if (mode === "ton" || mode === "raw") {
      return {value, mode}
    }
  }
  return {value: storedValue, mode: "raw"}
}

export const CoinsInput: React.FC<CoinsInputProps> = ({
  label,
  value = "",
  onChange,
  placeholder = "Enter amount",
  required = false,
  className,
  error,
  defaultMode = "raw",
}) => {
  const parsedValue = parseStoredValue(value)
  const [inputValue, setInputValue] = useState<string>(parsedValue.value)
  const [mode, setMode] = useState<"ton" | "raw">(parsedValue.mode)

  useEffect(() => {
    const newParsed = parseStoredValue(value)
    setInputValue(newParsed.value)
    setMode(newParsed.mode)
  }, [value])

  useEffect(() => {
    if (value === "" && mode !== defaultMode) {
      setMode(defaultMode)
    }
  }, [defaultMode, value, mode])

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const newValue = event.target.value
    setInputValue(newValue)
    onChange(newValue, mode)
  }

  const handleModeChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const newMode = event.target.value as "ton" | "raw"
    setMode(newMode)
    onChange(inputValue, newMode)
  }

  const inputElement = (
    <div className={styles.inputContainer}>
      <Input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder={
          placeholder + (mode === "ton" ? " as TON (e.g. 1.0)" : " as raw number (e.g. 1000000000)")
        }
        required={required}
        className={`${styles.input} ${className ?? ""}`}
        variant={error ? "error" : "default"}
      />
      <select className={styles.select} value={mode} onChange={handleModeChange}>
        <option value="ton">TON</option>
        <option value="raw">Raw</option>
      </select>
    </div>
  )

  const inputWithError = (
    <>
      {inputElement}
      {error && <div className={styles.errorMessage}>{error}</div>}
    </>
  )

  if (label) {
    return (
      <div className={styles.container}>
        <label>{label}</label>
        {inputWithError}
      </div>
    )
  }

  return inputWithError
}
