import React, {useState, useMemo, useEffect} from "react"

import {DeployedContract} from "../../../../common/types/contract"

import {Select} from "./Select"
import {Input} from "./Input"
import {Label} from "./Label"
import styles from "./AddressInput.module.css"

interface AddressInputProps {
  readonly label?: string
  readonly contracts: readonly DeployedContract[]
  readonly value?: string
  readonly onChange: (address: string) => void
  readonly placeholder?: string
  readonly required?: boolean
  readonly className?: string
}

type InputMode = "select" | "custom"

export const AddressInput: React.FC<AddressInputProps> = ({
  label,
  contracts,
  value = "",
  onChange,
  placeholder = "Enter contract address",
  required = false,
  className,
}) => {
  const [mode, setMode] = useState<InputMode>("select")

  const selectedContract = useMemo(() => {
    return contracts.find(c => c.address === value)
  }, [contracts, value])

  useEffect(() => {
    if (value && !selectedContract) {
      setMode("custom")
    }
  }, [value, selectedContract])

  useEffect(() => {
    if (!value && contracts.length > 0) {
      onChange(contracts[0].address)
    }
  }, [value, contracts, onChange])

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const selectedAddress = event.target.value
    if (selectedAddress === "custom") {
      setMode("custom")
      onChange("")
    } else {
      onChange(selectedAddress)
    }
  }

  const handleCustomInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    onChange(event.target.value)
  }

  const formatContractOption = (contract: DeployedContract): string => {
    if (contract.name && contract.name !== "Unknown Contract") {
      return `${contract.name} (${contract.address.slice(0, 8)}...${contract.address.slice(-6)})`
    }
    return `${contract.address.slice(0, 8)}...${contract.address.slice(-6)}`
  }

  const inputElement =
    mode === "select" ? (
      <Select
        value={selectedContract ? value : ""}
        onChange={handleSelectChange}
        required={required}
      >
        {contracts.map(contract => (
          <option key={contract.address} value={contract.address}>
            {formatContractOption(contract)}
          </option>
        ))}
        <option value="custom">Custom address...</option>
      </Select>
    ) : (
      <div className={styles.customInputContainer}>
        <Input
          type="text"
          value={value}
          onChange={handleCustomInputChange}
          placeholder={placeholder}
          required={required}
          className={`${styles.customInput} ${className ?? ""}`}
        />
        <button
          type="button"
          className={styles.arrowButton}
          onClick={() => {
            setMode("select")
          }}
          title="Select from deployed contracts"
        >
          Select from deployed
        </button>
      </div>
    )

  if (label) {
    return (
      <div className={styles.container}>
        <Label>{label}</Label>
        {inputElement}
      </div>
    )
  }

  return inputElement
}
