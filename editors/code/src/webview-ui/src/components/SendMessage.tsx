import React, {useState} from "react"
import {ContractAbi} from "@shared/abi"
import styles from "./SendMessage.module.css"

interface Contract {
    readonly address: string
    readonly name: string
    readonly abi?: ContractAbi
}

interface MessageData {
    readonly selectedMessage: string
    readonly messageFields: Record<string, string>
    readonly value: string
}

interface Props {
    readonly contracts: Contract[]
    readonly selectedContract?: string
    readonly onContractChange: (address: string) => void
    readonly onSendMessage: (messageData: MessageData) => void
    readonly result?: {success: boolean; message: string; details?: string}
}

export const SendMessage: React.FC<Props> = ({
    contracts,
    selectedContract,
    onContractChange,
    onSendMessage,
    result,
}) => {
    const [selectedMessage, setSelectedMessage] = useState<string>("")
    const [messageFields, setMessageFields] = useState<Record<string, string>>({})
    const [value, setValue] = useState<string>("1.0")
    const contract = contracts.find(c => c.address === selectedContract)
    const message = contract?.abi?.messages.find(m => m.name === selectedMessage)

    const handleFieldChange = (fieldName: string, fieldValue: string): void => {
        const newFields = {...messageFields, [fieldName]: fieldValue}
        setMessageFields(newFields)
    }

    const handleSendMessage = (): void => {
        if (!selectedContract || !selectedMessage) {
            return
        }
        onSendMessage({
            selectedMessage,
            messageFields,
            value,
        })
    }

    const formatAddress = (address: string): string => {
        if (address.length <= 12) return address
        return `${address.slice(0, 6)}...${address.slice(Math.max(0, address.length - 6))}`
    }

    return (
        <div className={styles.container}>
            <div className={styles.formGroup}>
                <label htmlFor="sendContractSelect">Target Contract:</label>
                <select
                    id="sendContractSelect"
                    value={selectedContract ?? ""}
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
                <label htmlFor="messageSelect">Message:</label>
                <select
                    id="messageSelect"
                    value={selectedMessage}
                    onChange={e => {
                        setSelectedMessage(e.target.value)
                        setMessageFields({})
                    }}
                    disabled={!contract?.abi?.messages}
                    className={styles.select}
                >
                    <option value="">Select message...</option>
                    {contract?.abi?.messages.map(msg => (
                        <option key={msg.name} value={msg.name}>
                            {msg.name} (opcode: 0x{msg.opcode.toString(16)})
                        </option>
                    ))}
                </select>
            </div>

            {message?.fields && message.fields.length > 0 ? (
                <div className={styles.messageFieldsContainer}>
                    {message.fields.map(field => (
                        <div key={field.name} className={styles.messageField}>
                            <div className={styles.messageFieldHeader}>
                                <span className={styles.messageFieldName}>{field.name}</span>
                                <span className={styles.messageFieldType}>{field.type}</span>
                            </div>
                            <input
                                type="text"
                                value={messageFields[field.name] || ""}
                                onChange={e => {
                                    handleFieldChange(field.name, e.target.value)
                                }}
                                placeholder={`Enter ${field.name} (${field.type})`}
                                className={styles.messageFieldInput}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                selectedMessage && (
                    <div className={styles.noMessages}>This message has no fields</div>
                )
            )}

            {!contract?.abi?.messages && selectedContract && (
                <div className={styles.noMessages}>No messages available for this contract</div>
            )}

            <div className={styles.formGroup}>
                <label htmlFor="sendValue">Value (TON):</label>
                <input
                    type="text"
                    id="sendValue"
                    value={value}
                    onChange={e => {
                        setValue(e.target.value)
                    }}
                    placeholder="1.0"
                    className={styles.input}
                />
            </div>

            <button
                onClick={handleSendMessage}
                disabled={contracts.length === 0}
                className={styles.button}
            >
                Send Message
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
