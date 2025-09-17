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

    const handleCompileAndDeploy = (): void => {
        if (contractAbi?.storage?.fields) {
            const emptyRequiredFields = contractAbi.storage.fields
                .filter(field => !storageFields[field.name].trim())
                .map(field => field.name)

            if (emptyRequiredFields.length > 0) {
                return
            }
        }
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
                                    type={field.type}
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
                                setValue(e.target.value)
                            }}
                            placeholder="1.0"
                        />
                    </div>

                    <Button onClick={handleCompileAndDeploy}>Compile & Deploy from Editor</Button>
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
