import React, {useState, useRef, useEffect} from "react"
import styles from "./SendModeSelector.module.css"

interface SendModeOption {
    readonly value: number
    readonly label: string
    readonly description: string
}

const SEND_MODE_OPTIONS: readonly SendModeOption[] = [
    {
        value: 0,
        label: "Regular",
        description:
            "Ordinary messages; gas fees deducted from sending amount; action phase errors not ignored",
    },
    {
        value: 1,
        label: "Pay Fees Separately",
        description: "Sender wants to pay transfer fees separately",
    },
    {
        value: 2,
        label: "Ignore Errors",
        description: "Ignore errors during action phase processing",
    },
    {
        value: 16,
        label: "Bounce on Action Fail",
        description: "Bounce transaction if action fails",
    },
    {
        value: 32,
        label: "Destroy Account",
        description: "Destroy account if resulting balance is zero",
    },
    {
        value: 64,
        label: "Carry All Remaining Message Value",
        description: "Carry all remaining value of inbound message",
    },
    {
        value: 128,
        label: "Carry All Balance",
        description: "Carry all remaining balance of current smart contract",
    },
    {
        value: 1024,
        label: "Estimate Fee Only",
        description: "Do not create action, only estimate fee",
    },
]

interface Props {
    readonly sendMode: number
    readonly onSendModeChange: (sendMode: number) => void
}

export const SendModeSelector: React.FC<Props> = ({sendMode, onSendModeChange}) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const activeModes = SEND_MODE_OPTIONS.filter(option =>
        option.value === 0 ? sendMode === 0 : (sendMode & option.value) !== 0,
    )

    const availableOptions = SEND_MODE_OPTIONS.filter(option =>
        option.value === 0 ? sendMode !== 0 : (sendMode & option.value) === 0,
    )

    const handleAddMode = (modeValue: number): void => {
        const newSendMode = sendMode | modeValue
        onSendModeChange(newSendMode)
        setIsDropdownOpen(false)
    }

    const handleRemoveMode = (modeValue: number): void => {
        const newSendMode = modeValue === 0 ? 0 : sendMode & ~modeValue
        onSendModeChange(newSendMode)
    }

    const handleClickOutside = (event: MouseEvent): void => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setIsDropdownOpen(false)
        }
    }

    useEffect(() => {
        document.addEventListener("mousedown", handleClickOutside)
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [])

    return (
        <div className={styles.container} ref={dropdownRef}>
            <label className={styles.label}>Send Mode:</label>
            <div className={styles.selector}>
                <div className={styles.activeModes}>
                    {activeModes.map(mode => (
                        <div key={mode.value} className={styles.modeTag}>
                            <span className={styles.modeLabel}>
                                {mode.label} ({mode.value})
                            </span>
                            <button
                                type="button"
                                className={styles.removeButton}
                                onClick={() => {
                                    handleRemoveMode(mode.value)
                                }}
                                aria-label={`Remove ${mode.label} mode`}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        className={styles.addButton}
                        onClick={() => {
                            setIsDropdownOpen(!isDropdownOpen)
                        }}
                        disabled={availableOptions.length === 0}
                        aria-label="Add send mode"
                    >
                        +
                    </button>
                </div>

                {isDropdownOpen && availableOptions.length > 0 && (
                    <div className={styles.dropdown}>
                        {availableOptions.map(option => (
                            <button
                                key={option.value}
                                type="button"
                                className={styles.dropdownItem}
                                onClick={() => {
                                    handleAddMode(option.value)
                                }}
                            >
                                <div className={styles.optionLabel}>
                                    {option.label} ({option.value})
                                </div>
                                <div className={styles.optionDescription}>{option.description}</div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {sendMode !== 0 && <div className={styles.modeValue}>Result: {sendMode}</div>}
        </div>
    )
}
