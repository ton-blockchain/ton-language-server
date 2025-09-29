import React, {useEffect, useState} from "react"
import {ContractAbi} from "@shared/abi"
import {Button, Input, Label, FieldInput} from "./ui"
import styles from "./CompileDeploy.module.css"

interface Props {
    readonly onCompileAndDeploy: (
        storageFields: Record<string, string>,
        value?: string,
        contractName?: string,
    ) => void
    readonly result?: {success: boolean; message: string; details?: string}
    readonly contractAbi?: ContractAbi
}

export const CompileDeploy: React.FC<Props> = ({onCompileAndDeploy, result, contractAbi}) => {
    const [storageFields, setStorageFields] = useState<Record<string, string>>({})
    const [value, setValue] = useState<string>("1.0")

    const [customContractName, setCustomContractName] = useState<string>(contractAbi?.name ?? "")

    const isAbiLoading = !contractAbi
    const defaultContractName = contractAbi?.name ?? "UnknownContract"
    const contractName = customContractName.trim() ? customContractName : defaultContractName

    useEffect(() => {
        setCustomContractName(contractAbi?.name ?? "")
    }, [contractAbi])

    const handleFieldChange = (fieldName: string, value: string): void => {
        const newFields = {...storageFields, [fieldName]: value}
        setStorageFields(newFields)
    }

    const isFormValid = (): boolean => {
        if (!contractName.trim()) {
            return false
        }

        if (contractAbi?.storage?.fields) {
            for (const field of contractAbi.storage.fields) {
                const value = storageFields[field.name] as string | undefined
                if (!value?.trim()) {
                    return false
                }
            }
        }

        const numericValue = Number.parseFloat(value)
        return !Number.isNaN(numericValue) && numericValue > 0
    }

    const handleCompileAndDeploy = (): void => {
        onCompileAndDeploy(storageFields, value, contractName)
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
                                    value={storageFields[field.name] || ""}
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
