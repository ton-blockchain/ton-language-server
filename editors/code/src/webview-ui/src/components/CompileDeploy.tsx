import React, {useState} from "react"
import {ContractAbi} from "@shared/abi"
import styles from "./CompileDeploy.module.css"

interface Props {
    readonly onCompileAndDeploy: (storageFields: Record<string, string>) => void
    readonly result?: {success: boolean; message: string; details?: string}
    readonly contractAbi?: ContractAbi
}

export const CompileDeploy: React.FC<Props> = ({onCompileAndDeploy, result, contractAbi}) => {
    const [storageFields, setStorageFields] = useState<Record<string, string>>({})

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
        onCompileAndDeploy(storageFields)
    }

    return (
        <div className={styles.container}>
            <div className={styles.formGroup}>
                <label>Deploy contract from active editor</label>
                <p className={styles.description}>
                    Opens the active Tolk file, compiles it, and deploys to sandbox
                </p>
            </div>

            {contractAbi?.storage?.fields && contractAbi.storage.fields.length > 0 && (
                <div className={styles.storageFields}>
                    <div className={styles.formGroup}>
                        <label>Storage Fields:</label>
                    </div>
                    {contractAbi.storage.fields.map(field => (
                        <div key={field.name} className={styles.messageField}>
                            <div className={styles.messageFieldHeader}>
                                <span className={styles.messageFieldName}>{field.name}</span>
                                <span className={styles.messageFieldType}>{field.type}</span>
                            </div>
                            <input
                                type="text"
                                value={storageFields[field.name] || ""}
                                onChange={e => {
                                    handleFieldChange(field.name, e.target.value)
                                }}
                                placeholder={`Enter ${field.name} (${field.type})`}
                                className={styles.messageFieldInput}
                            />
                        </div>
                    ))}
                </div>
            )}

            <button onClick={handleCompileAndDeploy} className={styles.button}>
                Compile & Deploy from Editor
            </button>

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
