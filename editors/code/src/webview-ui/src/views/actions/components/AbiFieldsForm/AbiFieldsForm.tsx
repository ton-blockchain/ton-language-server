import React, {useEffect, useMemo} from "react"
import {ContractAbi, Field, TypeAbi, TypeInfo} from "@shared/abi"
import {FieldInput, AddressInput} from "../../../../components/common"
import styles from "./AbiFieldsForm.module.css"
import * as binary from "../../../../../../providers/binary"
import {formatParsedSlice} from "../../../../../../providers/binary"
import {DeployedContract} from "../../../../../../providers/lib/contract"

interface Props {
    readonly abi: TypeAbi | undefined
    readonly contractAbi?: ContractAbi
    readonly contracts: readonly DeployedContract[]
    readonly fields: binary.ParsedObject
    readonly onFieldsChange: (fields: binary.ParsedObject) => void
    readonly onValidationChange: (isValid: boolean) => void
}

export const AbiFieldsForm: React.FC<Props> = ({
    abi,
    contractAbi,
    contracts,
    fields,
    onFieldsChange,
    onValidationChange,
}) => {
    const isAddressField = (fieldType: TypeInfo): boolean => {
        const containsAddress = (type: TypeInfo): boolean => {
            if (type.name === "address") {
                return true
            }
            if (type.name === "cell" && type.innerType) {
                return containsAddress(type.innerType)
            }
            if (type.name === "option") {
                return containsAddress(type.innerType)
            }
            if (type.name === "type-alias") {
                return containsAddress(type.innerType)
            }
            return false
        }

        return containsAddress(fieldType)
    }

    const handleFieldChange = (
        fieldPath: string,
        fieldValue: string,
        fieldType: TypeInfo,
    ): void => {
        const pathParts = fieldPath.split(".")
        let parsedValue: binary.ParsedSlice

        try {
            parsedValue = binary.parseStringFieldValue(fieldValue, fieldType)
        } catch {
            parsedValue = fieldValue
        }

        const newFields = {...fields}
        setNestedValue(newFields, pathParts, parsedValue, fieldPath)
        onFieldsChange(newFields)
    }

    const setNestedValue = (
        obj: binary.ParsedObject,
        path: string[],
        value: binary.ParsedSlice,
        fullPath: string,
    ): void => {
        if (path.length === 1) {
            obj[path[0]] = value
            return
        }

        const [first, ...rest] = path
        if (!obj[first] || typeof obj[first] !== "object") {
            // Find the struct name for this path level
            const structName = getStructNameForPath(fullPath, path.length - 1)
            obj[first] = {
                $: "nested-object",
                name: structName ?? "unknown",
                value: {} as binary.ParsedObject,
            } as binary.NestedObject
        }
        if ("$" in obj[first]) {
            const nestedObj = obj[first] as binary.NestedObject
            if (nestedObj.value) {
                setNestedValue(nestedObj.value, rest, value, fullPath)
            }
        } else {
            setNestedValue(obj[first] as binary.ParsedObject, rest, value, fullPath)
        }
    }

    const getStructNameForPath = (fullPath: string, depth: number): string | undefined => {
        if (!abi) return undefined

        const pathParts = fullPath.split(".")
        const pathToStruct = pathParts.slice(0, depth + 1)

        let currentFields = abi.fields
        let structName: string | undefined

        for (const part of pathToStruct) {
            const field = currentFields.find(f => f.name === part)

            if (!field) return undefined

            if (field.type.name === "struct" && contractAbi) {
                structName = field.type.humanReadable
                const structType = contractAbi.types.find(t => t.name === field.type.humanReadable)
                if (structType) {
                    currentFields = structType.fields
                } else {
                    return undefined
                }
            } else if (field.type.name === "anon-struct") {
                structName = field.type.humanReadable
                currentFields = field.type.fields.map((fieldType: TypeInfo, index: number) => ({
                    name: `field_${index}`,
                    type: fieldType,
                }))
            }
        }

        return structName
    }

    const getNestedValue = (
        obj: binary.ParsedObject,
        path: string[],
    ): binary.ParsedSlice | undefined => {
        if (path.length === 0) return obj
        if (path.length === 1) return obj[path[0]]

        const [first, ...rest] = path
        if (!obj[first] || typeof obj[first] !== "object") {
            return undefined
        }

        if ("$" in obj[first]) {
            const nestedObj = obj[first] as binary.NestedObject
            return nestedObj.value ? getNestedValue(nestedObj.value, rest) : undefined
        } else {
            return getNestedValue(obj[first] as binary.ParsedObject, rest)
        }
    }

    const validateFields = (
        fieldsToValidate: readonly Field[],
        currentFields: binary.ParsedObject,
        pathPrefix: string = "",
    ): boolean => {
        for (const field of fieldsToValidate) {
            // const fieldPath = pathPrefix ? `${pathPrefix}.${field.name}` : field.name
            // const pathParts = fieldPath.split(".")
            // const fieldValue = getNestedValue(currentFields, pathParts)

            if (field.type.name === "struct") {
                // const structType = contractAbi.types.find(t => t.name === field.type.humanReadable)
                // if (structType) {
                //     if (!validateFields(structType.fields, currentFields, fieldPath)) {
                //         return false
                //     }
                // }
                return true // TODO: validate nested fields
            }

            if (field.type.name === "anon-struct") {
                // const anonStructFields = field.type.fields.map(
                //     (fieldType: TypeInfo, index: number) => ({
                //         name: `field_${index}`,
                //         type: fieldType,
                //     }),
                // )
                // if (!validateFields(anonStructFields, currentFields, fieldPath)) {
                //     return false
                // }
                return true // TODO: validate nested fields
            }

            const fieldValue = fields[field.name]
            if (fieldValue === undefined) {
                return false
            }
            if (!formatParsedSlice(fieldValue)?.trim()) {
                return false
            }
        }

        return true
    }

    const isFormValid = useMemo((): boolean => {
        if (!abi?.fields) return false
        return validateFields(abi.fields, fields)
    }, [abi, fields, contractAbi])

    useEffect(() => {
        onValidationChange(isFormValid)
    }, [isFormValid, onValidationChange])

    const renderFields = (
        fieldsToRender: readonly Field[],
        pathPrefix: string = "",
        depth: number = 0,
    ): React.ReactNode => {
        return fieldsToRender.map(field => {
            const fieldPath = pathPrefix ? `${pathPrefix}.${field.name}` : field.name
            const pathParts = fieldPath.split(".")
            const fieldValue = getNestedValue(fields, pathParts)

            if (field.type.name === "struct" && contractAbi) {
                const structType = contractAbi.types.find(t => t.name === field.type.humanReadable)
                if (structType) {
                    return (
                        <div key={fieldPath} className={styles.nestedFieldGroup}>
                            <div className={styles.structLabel}>
                                <span className={styles.fieldName}>{field.name}</span>
                                <span className={styles.fieldType}>{field.type.humanReadable}</span>
                            </div>
                            <div className={styles.nestedFields}>
                                {renderFields(structType.fields, fieldPath, depth + 1)}
                            </div>
                        </div>
                    )
                }
            }

            if (field.type.name === "anon-struct") {
                const anonStructFields = field.type.fields.map(
                    (fieldType: TypeInfo, index: number) => ({
                        name: `field_${index}`,
                        type: fieldType,
                    }),
                )
                return (
                    <div key={fieldPath} className={styles.nestedFieldGroup}>
                        <div className={styles.structLabel}>
                            <span className={styles.fieldName}>{field.name}</span>
                            <span className={styles.fieldType}>{field.type.humanReadable}</span>
                        </div>
                        <div className={styles.nestedFields}>
                            {renderFields(anonStructFields, fieldPath, depth + 1)}
                        </div>
                    </div>
                )
            }

            if (isAddressField(field.type)) {
                return (
                    <div key={fieldPath} className={styles.fieldContainer}>
                        <div className={styles.fieldHeader}>
                            <span className={styles.fieldName}>{field.name}</span>
                            <span className={styles.fieldType}>{field.type.humanReadable}</span>
                        </div>
                        <AddressInput
                            contracts={contracts}
                            value={formatParsedSlice(fieldValue) ?? ""}
                            onChange={value => {
                                handleFieldChange(fieldPath, value, field.type)
                            }}
                            placeholder={`Enter ${field.type.humanReadable}`}
                            className={styles.addressInput}
                        />
                    </div>
                )
            }

            return (
                <FieldInput
                    key={fieldPath}
                    name={field.name}
                    type={field.type.humanReadable}
                    value={formatParsedSlice(fieldValue) ?? ""}
                    onChange={value => {
                        handleFieldChange(fieldPath, value, field.type)
                    }}
                />
            )
        })
    }

    return (
        <div className={styles.container}>
            {abi?.fields && abi.fields.length > 0 && (
                <div className={styles.fieldsContainer}>{renderFields(abi.fields)}</div>
            )}
        </div>
    )
}
