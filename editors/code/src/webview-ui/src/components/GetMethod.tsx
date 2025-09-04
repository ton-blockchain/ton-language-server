import React from "react"
import {ContractAbi} from "@shared/abi"
import styles from "./GetMethod.module.css"

interface Contract {
    readonly address: string
    readonly name: string
    readonly abi?: ContractAbi
}

interface Props {
    readonly contracts: Contract[]
    readonly selectedContract?: string
    readonly selectedMethod?: string
    readonly methodId?: string
    readonly onContractChange: (address: string) => void
    readonly onMethodChange: (methodName: string) => void
    readonly onMethodIdChange: (methodId: string) => void
    readonly onCallGetMethod: () => void
    readonly result?: {success: boolean; message: string; details?: string}
}

export const GetMethod: React.FC<Props> = ({
    contracts,
    selectedContract,
    selectedMethod,
    methodId = "0",
    onContractChange,
    onMethodChange,
    onMethodIdChange,
    onCallGetMethod,
    result,
}) => {
    const contract = contracts.find(c => c.address === selectedContract)
    const method = contract?.abi?.getMethods?.find(m => m.name === selectedMethod)

    const handleMethodChange = (methodName: string) => {
        onMethodChange(methodName)
        const selectedMethod = contract?.abi?.getMethods?.find(m => m.name === methodName)
        if (selectedMethod) {
            onMethodIdChange(selectedMethod.id.toString())
        } else {
            onMethodIdChange("0")
        }
    }

    const handleCallGetMethod = () => {
        if (!selectedContract) {
            return
        }
        onCallGetMethod()
    }

    const formatAddress = (address: string) => {
        if (address.length <= 12) return address
        return `${address.slice(0, 6)}...${address.slice(Math.max(0, address.length - 6))}`
    }

    const isMethodIdReadonly = Boolean(method)

    return (
        <div className={styles.container}>
            <div className={styles.formGroup}>
                <label htmlFor="getContractSelect">Target Contract:</label>
                <select
                    id="getContractSelect"
                    value={selectedContract || ""}
                    onChange={e => {
                        onContractChange(e.target.value)
                    }}
                    className={styles.select}
                >
                    <option value="">Select contract...</option>
                    {contracts.map(contract => (
                        <option key={contract.address} value={contract.address}>
                            {contract.name} ({formatAddress(contract.address)})
                        </option>
                    ))}
                </select>
            </div>

            <div className={styles.formGroup}>
                <label htmlFor="methodSelect">Get Method:</label>
                <select
                    id="methodSelect"
                    value={selectedMethod || ""}
                    onChange={e => {
                        handleMethodChange(e.target.value)
                    }}
                    disabled={!contract?.abi?.getMethods}
                    className={styles.select}
                >
                    <option value="">Select method...</option>
                    {contract?.abi?.getMethods?.map(method => (
                        <option key={method.name} value={method.name}>
                            {method.name} (ID: 0x{method.id.toString(16)})
                        </option>
                    ))}
                </select>
            </div>

            <div className={styles.formGroup}>
                <label htmlFor="methodId">Method ID:</label>
                <input
                    type="number"
                    id="methodId"
                    value={methodId}
                    onChange={e => {
                        onMethodIdChange(e.target.value)
                    }}
                    placeholder="0"
                    readOnly={isMethodIdReadonly}
                    className={`${styles.input} ${isMethodIdReadonly ? styles.readonly : ""}`}
                />
            </div>

            <button
                onClick={handleCallGetMethod}
                disabled={contracts.length === 0}
                className={styles.button}
            >
                Call Get Method
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
