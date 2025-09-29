import React, {useEffect, useMemo} from "react"
import {TypeAbi} from "@shared/abi"
import {FieldInput} from "./ui"
import styles from "./AbiFieldsForm.module.css"
import * as binary from "../../../providers/binary"
import {formatParsedSlice} from "../../../providers/binary"

interface Props {
    readonly abi: TypeAbi | undefined
    readonly fields: binary.ParsedObject
    readonly onFieldsChange: (fields: binary.ParsedObject) => void
    readonly onValidationChange: (isValid: boolean) => void
}

export const AbiFieldsForm: React.FC<Props> = ({
    abi,
    fields,
    onFieldsChange,
    onValidationChange,
}) => {
    const handleFieldChange = (fieldName: string, fieldValue: string): void => {
        if (!abi) return

        const field = abi.fields.find(f => f.name === fieldName)
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

        const newFields = {...fields, [fieldName]: parsedValue}
        onFieldsChange(newFields)
    }

    const isFormValid = useMemo((): boolean => {
        if (!abi?.fields) return false

        for (const field of abi.fields) {
            const fieldValue = fields[field.name] as string | undefined
            if (fieldValue === undefined) {
                return false
            }
            if (!formatParsedSlice(fieldValue)?.trim()) {
                return false
            }
        }

        return true
    }, [abi, fields])

    useEffect(() => {
        onValidationChange(isFormValid)
    }, [isFormValid, onValidationChange])

    return (
        <div className={styles.container}>
            {abi?.fields && abi.fields.length > 0 && (
                <div className={styles.fieldsContainer}>
                    {abi.fields.map(field => (
                        <FieldInput
                            key={field.name}
                            name={field.name}
                            type={field.type.humanReadable}
                            value={formatParsedSlice(fields[field.name]) ?? ""}
                            onChange={value => {
                                handleFieldChange(field.name, value)
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
