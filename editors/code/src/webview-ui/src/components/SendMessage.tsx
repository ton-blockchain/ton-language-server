import React, {useState} from "react"
import {ContractAbi} from "@shared/abi"
import {Button, Input, Select} from "./ui"
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
    readonly autoDebug?: boolean
}

interface Props {
    readonly contracts: Contract[]
    readonly selectedContract?: string
    readonly onContractChange: (address: string) => void
    readonly onSendMessage: (messageData: MessageData) => void
    readonly handleShowTransactionDetails: (tx: LastTransaction) => void
    readonly result?: {success: boolean; message: string; details?: string}
}

interface LastTransaction {
    readonly contractAddress: string
    readonly methodName: string
    readonly transactionId?: string
    readonly timestamp: string
}

export const SendMessage: React.FC<Props> = ({
    contracts,
    selectedContract,
    onContractChange,
    onSendMessage,
    handleShowTransactionDetails,
    result,
}) => {
    const [selectedMessage, setSelectedMessage] = useState<string>("")
    const [messageFields, setMessageFields] = useState<Record<string, string>>({})
    const [value, setValue] = useState<string>("1.0")
    const [lastTransaction, setLastTransaction] = useState<LastTransaction | null>(null)
    const [autoDebug, setAutoDebug] = useState<boolean>(false)

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

        setLastTransaction({
            contractAddress: selectedContract,
            methodName: selectedMessage,
            timestamp: new Date().toISOString(),
        })

        onSendMessage({
            selectedMessage,
            messageFields,
            value,
            autoDebug,
        })
    }

    const formatAddress = (address: string): string => {
        if (address.length <= 12) return address
        return `${address.slice(0, 6)}...${address.slice(Math.max(0, address.length - 6))}`
    }

    return (
        <div className={styles.container}>
            <div className={styles.formGroup}>
                <Select
                    label="Target Contract:"
                    id="sendContractSelect"
                    value={selectedContract ?? ""}
                    onChange={e => {
                        onContractChange(e.target.value)
                    }}
                >
                    <option value="">Select contract...</option>
                    {contracts.map(contract => (
                        <option key={contract.address} value={contract.address}>
                            {contract.name} ({formatAddress(contract.address)})
                        </option>
                    ))}
                </Select>
            </div>

            <div className={styles.formGroup}>
                <Select
                    label="Message:"
                    id="messageSelect"
                    value={selectedMessage}
                    onChange={e => {
                        setSelectedMessage(e.target.value)
                        setMessageFields({})
                    }}
                    disabled={!contract?.abi?.messages}
                >
                    <option value="">Select message...</option>
                    {contract?.abi?.messages.map(msg => (
                        <option key={msg.name} value={msg.name}>
                            {msg.name} (opcode: 0x{msg.opcode.toString(16)})
                        </option>
                    ))}
                </Select>
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
                <Input
                    label="Value (TON):"
                    type="text"
                    id="sendValue"
                    value={value}
                    onChange={e => {
                        setValue(e.target.value)
                    }}
                    placeholder="1.0"
                />
            </div>

            <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                    <input
                        type="checkbox"
                        checked={autoDebug}
                        onChange={e => {
                            setAutoDebug(e.target.checked)
                        }}
                        className={styles.checkbox}
                        id="autoDebugCheckbox"
                    />
                    <span className={styles.checkboxMark}></span>
                    <span className={styles.checkboxText}>Launch Assembly Debugger after send</span>
                </label>
            </div>

            <Button onClick={handleSendMessage} disabled={contracts.length === 0}>
                Send Message
            </Button>

            {result && (
                <div className={styles.resultContainer}>
                    <div
                        className={`${styles.result} ${result.success ? styles.success : styles.error}`}
                    >
                        {result.message}
                        {result.details && `\n\n${result.details}`}
                    </div>
                    {result.success && lastTransaction && (
                        <Button
                            variant="secondary"
                            size="small"
                            onClick={() => {
                                handleShowTransactionDetails(lastTransaction)
                            }}
                            className={styles.transactionDetailsButton}
                        >
                            Show Transaction Details
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}
