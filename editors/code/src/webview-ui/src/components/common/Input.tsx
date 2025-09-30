import React from "react"
import {Label} from "./Label"
import styles from "./Input.module.css"

// eslint-disable-next-line functional/type-declaration-immutability
interface InputProps extends Readonly<React.InputHTMLAttributes<HTMLInputElement>> {
    readonly variant?: "default" | "error"
    readonly label?: string
}

export const Input: React.FC<InputProps> = ({
    variant = "default",
    label,
    className,
    id,
    ...props
}) => {
    const inputId = id ?? (label ? `input-${Math.random().toString(36).slice(2, 11)}` : undefined)
    const inputClass = [styles.input, styles[variant], className].filter(Boolean).join(" ")

    const inputElement = <input className={inputClass} id={inputId} {...props} />

    if (label) {
        return (
            <div className={styles.inputWithLabel}>
                <Label htmlFor={inputId}>{label}</Label>
                {inputElement}
            </div>
        )
    }

    return inputElement
}
