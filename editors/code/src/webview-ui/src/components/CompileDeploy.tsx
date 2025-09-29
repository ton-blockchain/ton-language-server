import React, {useEffect, useState} from "react"
import {ContractAbi} from "@shared/abi"
import {Button, Input, Label, FieldInput} from "./ui"
import styles from "./CompileDeploy.module.css"
import * as binary from "../../../providers/binary"
import {formatParsedSlice} from "../../../providers/binary"

interface Props {
    readonly onCompileAndDeploy: (
        stateInit: string, // Base64 encoded Cell
        value?: string,
        contractName?: string,
    ) => void
    readonly result?: {success: boolean; message: string; details?: string}
    readonly contractAbi?: ContractAbi
}

export const CompileDeploy: React.FC<Props> = ({onCompileAndDeploy, result, contractAbi}) => {
    const [storageFields, setStorageFields] = useState<binary.ParsedObject>({})
    const [value, setValue] = useState<string>("1.0")

    const [customContractName, setCustomContractName] = useState<string>(contractAbi?.name ?? "")

    const isAbiLoading = !contractAbi
    const defaultContractName = contractAbi?.name ?? "UnknownContract"
    const contractName = customContractName.trim() ? customContractName : defaultContractName

    useEffect(() => {
        setCustomContractName(contractAbi?.name ?? "")
    }, [contractAbi])

    const handleFieldChange = (fieldName: string, fieldValue: string): void => {
        const storage = contractAbi?.storage
        const field = storage?.fields.find(f => f.name === fieldName)

        let parsedValue: binary.ParsedSlice
        if (field) {
            try {
                parsedValue = binary.parseStringFieldValue(fieldValue, field.type)
            } catch {
                parsedValue = fieldValue
            }
        } else {
            parsedValue = fieldValue
        }

        const newFields = {...storageFields, [fieldName]: parsedValue}
        setStorageFields(newFields)
    }

    const createStateInit = (): string => {
        if (!contractAbi?.storage) {
            throw new Error("Storage ABI not found")
        }

        try {
            const encodedCell = binary.encodeData(contractAbi, contractAbi.storage, storageFields)
            return encodedCell.toBoc().toString("base64")
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

        if (contractAbi?.storage?.fields) {
            for (const field of contractAbi.storage.fields) {
                const fieldValue = storageFields[field.name] as string | undefined
                if (fieldValue === undefined) {
                    return false
                }
                if (!formatParsedSlice(fieldValue)?.trim()) {
                    return false
                }
            }
        }

        const numericValue = Number.parseFloat(value)
        return !Number.isNaN(numericValue) && numericValue > 0
    }

    const handleCompileAndDeploy = (): void => {
        onCompileAndDeploy(createStateInit(), value, contractName)
    }

    return (
        <div className={styles.container}>
            <div className={styles.formGroup}>
                <Label>Deploy contract from active editor</Label>
            </div>

            {isAbiLoading ? (
                <div className={styles.loading}>
                    <div className={styles.loadingSpinner}></div>
                    <div className={styles.loadingText}>Loading contract ABI...</div>
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

                    {contractAbi.storage?.fields && contractAbi.storage.fields.length > 0 && (
                        <div className={styles.storageFields}>
                            <div className={styles.formGroup}>
                                <Label>Storage Fields:</Label>
                            </div>
                            {contractAbi.storage.fields.map(field => (
                                <FieldInput
                                    key={field.name}
                                    name={field.name}
                                    type={field.type.humanReadable}
                                    value={
                                        binary.formatParsedSlice(storageFields[field.name]) ?? ""
                                    }
                                    onChange={value => {
                                        handleFieldChange(field.name, value)
                                    }}
                                />
                            ))}
                        </div>
                    )}

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
