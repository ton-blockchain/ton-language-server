import React, {useEffect, useState} from "react"

import {ContractAbi, Field, TypeAbi, TypeInfo} from "@shared/abi"

import {FieldInput, AddressInput} from "../../../../components/common"

import * as binary from "../../../../../../common/binary"
import {DeployedContract} from "../../../../../../common/types/contract"

import styles from "./AbiFieldsForm.module.css"

interface Props {
  readonly abi: TypeAbi | undefined
  readonly contractAbi?: ContractAbi
  readonly contracts: readonly DeployedContract[]
  readonly fields: binary.FlattenParsedObject
  readonly onFieldsChange: (fields: binary.FlattenParsedObject) => void
  readonly onValidationChange: (isValid: boolean) => void
  readonly onClearResult?: () => void
}

export const AbiFieldsForm: React.FC<Props> = ({
  abi,
  contractAbi,
  contracts,
  fields,
  onFieldsChange,
  onValidationChange,
  onClearResult,
}) => {
  const [rawFields, setRawFields] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({})
  const [isFormValid, setIsFormValid] = useState<boolean>(true)

  const handleFieldChange = (fieldPath: string, fieldValue: string, fieldType: TypeInfo): void => {
    let parsedValue: binary.ParsedSlice
    let errorMessage: string | undefined

    try {
      parsedValue = binary.parseStringFieldValue(fieldValue, fieldType)
    } catch (error) {
      parsedValue = fieldValue
      errorMessage = error instanceof Error ? error.message : "Invalid value"
    }

    const newFields = {...fields}
    newFields[fieldPath] = parsedValue
    onFieldsChange(newFields)

    onClearResult?.()

    setFieldErrors(prev => ({...prev, [fieldPath]: errorMessage}))
  }

  const handleFieldErrorReset = (fieldPath: string): void => {
    setFieldErrors(prev => ({...prev, [fieldPath]: undefined}))
  }

  useEffect(() => {
    if (!abi?.fields) {
      setIsFormValid(false)
      return
    }

    const hasErrors = Object.values(fieldErrors).some(error => error !== undefined)
    if (hasErrors) {
      setIsFormValid(false)
      return
    }

    setIsFormValid(true)
    // TODO
    // console.log(Object.values(rawFields))
    // const allFieldsFilled = Object.values(rawFields).every(value => value.trim() !== "")
    // setIsFormValid(allFieldsFilled)
  }, [abi?.fields, fieldErrors, rawFields])

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

      if (!(fieldPath in rawFields)) {
        setRawFields(prev => ({...prev, [fieldPath]: ""}))
      }

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

      if (field.type.name === "cell" && field.type.innerType && contractAbi) {
        const innerType = field.type.innerType
        if (innerType.name === "struct") {
          const structType = contractAbi.types.find(t => t.name === innerType.humanReadable)
          if (structType) {
            return (
              <div key={fieldPath} className={styles.nestedFieldGroup}>
                <div className={styles.structLabel}>
                  <span className={styles.fieldName}>{field.name}</span>
                  <span className={styles.fieldType}>Cell&lt;{innerType.humanReadable}&gt;</span>
                </div>
                <div className={styles.nestedFields}>
                  {renderFields(structType.fields, fieldPath, depth + 1)}
                </div>
              </div>
            )
          }
        }
      }
      // TODO: Cell<int32>

      if (field.type.name === "anon-struct") {
        const anonStructFields = field.type.fields.map((fieldType: TypeInfo, index: number) => ({
          name: `field_${index}`,
          type: fieldType,
        }))
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
              value={rawFields[fieldPath]}
              onChange={value => {
                setRawFields(prev => ({...prev, [fieldPath]: value}))
                handleFieldChange(fieldPath, value, field.type)
              }}
              placeholder={`Enter ${field.type.humanReadable}`}
              className={styles.addressInput}
              error={fieldErrors[fieldPath]}
              onErrorChange={error => {
                handleFieldErrorReset(fieldPath)
              }}
            />
          </div>
        )
      }

      return (
        <FieldInput
          key={fieldPath}
          name={field.name}
          type={field.type.humanReadable}
          value={rawFields[fieldPath]}
          onChange={value => {
            setRawFields(prev => ({...prev, [fieldPath]: value}))
            handleFieldChange(fieldPath, value, field.type)
          }}
          error={fieldErrors[fieldPath]}
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

function isAddressField(fieldType: TypeInfo): boolean {
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
