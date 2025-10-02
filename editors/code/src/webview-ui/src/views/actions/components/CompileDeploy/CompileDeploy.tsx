import React, {useEffect, useMemo, useState} from "react"

import {ContractAbi} from "@shared/abi"

import {
  Button,
  Input,
  Label,
  Select,
  OperationResultDisplay,
  LoadingSpinner,
} from "../../../../components/common"

import * as binary from "../../../../../../common/binary"
import {AbiFieldsForm} from "../AbiFieldsForm/AbiFieldsForm"
import {DeployedContract} from "../../../../../../common/types/contract"
import {DeployState} from "../../../../../../providers/sandbox/methods"
import {Base64String} from "../../../../../../common/base64-string"

import {ResultData} from "../../sandbox-actions-types"

import styles from "./CompileDeploy.module.css"

interface Props {
  readonly onCompileAndDeploy: (
    stateData: Base64String,
    value: string,
    contractName: string,
    storageType?: string,
  ) => void
  readonly onRedeployByName: (contractName: string, stateData: Base64String, value: string) => void
  readonly result: ResultData | undefined
  readonly contractAbi?: ContractAbi
  readonly contracts: readonly DeployedContract[]
  readonly deployState?: DeployState | null
  readonly onResultUpdate?: (result: ResultData | undefined) => void
}

export const CompileDeploy: React.FC<Props> = ({
  onCompileAndDeploy,
  onRedeployByName,
  result,
  contractAbi,
  contracts,
  deployState,
  onResultUpdate,
}) => {
  const [storageFields, setStorageFields] = useState<binary.RawStringObject>({})
  const [value, setValue] = useState<string>("1.0")
  const [isStorageFieldsValid, setStorageFieldsValid] = useState<boolean>(true)

  const [customContractName, setCustomContractName] = useState<string>(contractAbi?.name ?? "")
  const [selectedStorageType, setSelectedStorageType] = useState<string>("")

  const isAbiLoading = !deployState
  const hasValidationErrors =
    deployState && (!deployState.isValidFile || !deployState.hasRequiredFunctions)
  const defaultContractName = contractAbi?.name ?? "UnknownContract"
  const contractName = customContractName.trim() ? customContractName : defaultContractName

  const existingContract = contracts.find(c => c.name === contractName)

  const storageTypes = useMemo(() => {
    if (!contractAbi?.types) return []
    return contractAbi.types.filter(type => type.name.includes("Storage"))
  }, [contractAbi?.types])

  const storageAbi = useMemo(() => {
    if (contractAbi?.storage) {
      return contractAbi.storage
    }
    if (selectedStorageType && contractAbi?.types) {
      return contractAbi.types.find(type => type.name === selectedStorageType)
    }
    if (storageTypes.length > 0 && !selectedStorageType) {
      return storageTypes[0]
    }
    return undefined
  }, [contractAbi?.storage, contractAbi?.types, selectedStorageType, storageTypes])

  useEffect(() => {
    setCustomContractName(contractAbi?.name ?? "")
  }, [contractAbi])

  useEffect(() => {
    if (storageTypes.length > 0 && !selectedStorageType && !contractAbi?.storage) {
      setSelectedStorageType(storageTypes[0].name)
    }
  }, [storageTypes, selectedStorageType, contractAbi?.storage])

  useEffect(() => {
    setStorageFields({})
  }, [selectedStorageType])

  const createStateData = (): Base64String => {
    if (!contractAbi) {
      throw new Error("Contract ABI not found")
    }
    if (!storageAbi) {
      throw new Error("Storage ABI not found")
    }

    try {
      const encodedCell = binary.encodeData(
        contractAbi,
        storageAbi,
        binary.rawStringObjectToParsedObject(storageFields),
      )
      return encodedCell.toBoc().toString("base64") as Base64String
    } catch (error) {
      throw new Error(
        `Failed to encode storage: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  const isFormValid = (): boolean => {
    if (!contractName.trim()) {
      return false
    }

    if (!isStorageFieldsValid) {
      return false
    }

    const numericValue = Number.parseFloat(value)
    return !Number.isNaN(numericValue) && numericValue > 0
  }

  const handleCompileAndDeploy = (): void => {
    try {
      const storageTypeToPass =
        !contractAbi?.storage && selectedStorageType ? selectedStorageType : undefined
      onCompileAndDeploy(createStateData(), value, contractName, storageTypeToPass)
    } catch (error) {
      const errorResult = {
        success: false,
        message: "Failed to prepare contract data",
        details: error instanceof Error ? error.message : "Unknown error",
      }
      onResultUpdate?.(errorResult)
    }
  }

  const handleRedeploy = (): void => {
    try {
      onRedeployByName(contractName, createStateData(), value)
    } catch (error) {
      const errorResult = {
        success: false,
        message: "Failed to prepare contract data",
        details: error instanceof Error ? error.message : "Unknown error",
      }
      onResultUpdate?.(errorResult)
    }
  }

  const getErrorTitle = (deployState?: DeployState | null): string => {
    if (!deployState) return "Unknown validation error"
    if (!deployState.isValidFile) return "Invalid file type"
    if (!deployState.hasRequiredFunctions) return "Missing required functions"
    return "Contract validation failed"
  }

  return (
    <div className={styles.container}>
      <div className={styles.formGroup}>
        <Label>Deploy contract from the active editor</Label>
      </div>

      {isAbiLoading ? (
        <LoadingSpinner message="Loading contract ABI..." />
      ) : hasValidationErrors ? (
        <div className={styles.validationError}>
          <div className={styles.errorMessage}>
            <span className={styles.errorIcon}>⚠</span>
            {getErrorTitle(deployState)}
          </div>
          <div className={styles.errorDetails}>
            {deployState.errorMessage ?? "File validation failed"}
          </div>
          {deployState.fileName && (
            <div className={styles.fileInfo}>
              Current file: <strong>{deployState.fileName}</strong>
            </div>
          )}
        </div>
      ) : deployState.errorMessage ? (
        <div className={`${styles.result} ${styles.error}`}>
          <span className={styles.errorIcon}>⚠</span>
          ABI Loading Failed
          <div className={styles.errorDetails}>{deployState.errorMessage}</div>
        </div>
      ) : (
        <>
          <div className={styles.formGroup}>
            <Input
              label="Contract Name:"
              type="text"
              id="contractName"
              value={customContractName}
              onChange={e => {
                setCustomContractName(e.target.value)
              }}
              placeholder={defaultContractName}
            />
          </div>

          {!contractAbi?.storage && storageTypes.length > 1 && (
            <div className={styles.formGroup}>
              <Select
                label="Storage Type:"
                value={selectedStorageType}
                onChange={e => {
                  setSelectedStorageType(e.target.value)
                }}
              >
                {storageTypes.map(storageType => (
                  <option key={storageType.name} value={storageType.name}>
                    {storageType.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <AbiFieldsForm
            abi={storageAbi}
            contractAbi={contractAbi}
            contracts={contracts}
            fields={storageFields}
            onFieldsChange={setStorageFields}
            onValidationChange={setStorageFieldsValid}
            onClearResult={() => onResultUpdate?.(undefined)}
          />

          <div className={styles.formGroup}>
            <Input
              label="Value (TON):"
              type="text"
              id="deployValue"
              value={value}
              onChange={e => {
                const newValue = e.target.value
                const numericValue = Number.parseFloat(newValue)
                if (!Number.isNaN(numericValue) && numericValue >= 0) {
                  setValue(newValue)
                } else if (newValue === "" || newValue === ".") {
                  setValue(newValue)
                }
              }}
              placeholder="1.0"
            />
          </div>

          {result && (
            <OperationResultDisplay result={result} onClose={() => onResultUpdate?.(undefined)} />
          )}

          <Button
            onClick={existingContract ? handleRedeploy : handleCompileAndDeploy}
            disabled={!isFormValid()}
          >
            {existingContract ? "Redeploy Contract" : "Compile & Deploy from Editor"}
          </Button>
        </>
      )}
    </div>
  )
}
