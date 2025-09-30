import React, {useEffect, useMemo, useState} from "react"
import {ContractAbi} from "@shared/abi"
import {Button, Input, Label, Select} from "./ui"
import styles from "./CompileDeploy.module.css"
import * as binary from "../../../providers/binary"
import {AbiFieldsForm} from "./AbiFieldsForm"
import {DeployedContract} from "../../../providers/lib/contract"
import {DeployState} from "../../../providers/methods"
import {Base64String} from "../../../common/base64-string"

interface Props {
    readonly onCompileAndDeploy: (
        stateData: Base64String,
        value: string,
        contractName: string,
        storageType?: string,
    ) => void
    readonly result?: {success: boolean; message: string; details?: string}
    readonly contractAbi?: ContractAbi
    readonly contracts: readonly DeployedContract[]
    readonly deployState?: DeployState | null
}

export const CompileDeploy: React.FC<Props> = ({
    onCompileAndDeploy,
    result,
    contractAbi,
    contracts,
    deployState,
}) => {
    const [storageFields, setStorageFields] = useState<binary.ParsedObject>({})
    const [value, setValue] = useState<string>("1.0")
    const [isStorageFieldsValid, setStorageFieldsValid] = useState<boolean>(true)

    const [customContractName, setCustomContractName] = useState<string>(contractAbi?.name ?? "")
    const [selectedStorageType, setSelectedStorageType] = useState<string>("")

    const isAbiLoading = !deployState
    const hasValidationErrors =
        deployState && (!deployState.isValidFile || !deployState.hasRequiredFunctions)
    const defaultContractName = contractAbi?.name ?? "UnknownContract"
    const contractName = customContractName.trim() ? customContractName : defaultContractName

    const storageTypes = useMemo(() => {
        if (!contractAbi?.types) return []
        return contractAbi.types.filter(type => type.name.includes("Storage"))
    }, [contractAbi?.types])

    const storageAbi = useMemo(() => {
        if (contractAbi?.storage) {
            return contractAbi.storage
        }
        if (selectedStorageType && contractAbi?.types) {
            return contractAbi.types.find(type => type.name === selectedStorageType) ?? undefined
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
            const encodedCell = binary.encodeData(contractAbi, storageAbi, storageFields)
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
        const storageTypeToPass =
            !contractAbi?.storage && selectedStorageType ? selectedStorageType : undefined
        onCompileAndDeploy(createStateData(), value, contractName, storageTypeToPass)
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
                <div className={styles.loading}>
                    <div className={styles.loadingSpinner}></div>
                    <div className={styles.loadingText}>Loading contract ABI...</div>
                </div>
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
                    <div style={{marginTop: "6px", opacity: 0.9}}>{deployState.errorMessage}</div>
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

                    <Button onClick={handleCompileAndDeploy} disabled={!isFormValid()}>
                        Compile & Deploy from Editor
                    </Button>
                </>
            )}

            {result && (
                <div
                    className={`${styles.result} ${result.success ? styles.success : styles.error}`}
                >
                    {result.message}
                    {result.details && `\n\n${result.details}`}
                </div>
            )}
        </div>
    )
}
