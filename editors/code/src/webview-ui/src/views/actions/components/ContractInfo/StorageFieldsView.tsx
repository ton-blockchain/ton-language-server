import React from "react"
import {Address, Cell, ExternalAddress, Slice} from "@ton/core"

import {DeployedContract} from "../../../../../../common/types/contract"
import {AddressNone, ParsedObject, ParsedSlice} from "../../../../../../common/binary"

import * as binary from "../../../../../../common/binary"

import {ContractAddressChip} from "./ContractAddressChip"
import {BinaryValueChip} from "./BinaryValueChip"

import styles from "./StorageFieldsView.module.css"

interface StorageFieldsViewProps {
  readonly data: ParsedObject
  readonly contracts: DeployedContract[]
}

export function StorageFieldsView({data, contracts}: StorageFieldsViewProps): React.JSX.Element {
  const renderValue = (value: ParsedSlice | undefined): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className={styles.nullValue}>null</span>
    }

    if (
      value instanceof Address ||
      value instanceof ExternalAddress ||
      value instanceof AddressNone
    ) {
      return <ContractAddressChip address={value.toString()} contracts={contracts} />
    }

    if (value instanceof Cell) {
      return <BinaryValueChip value={value.asSlice()} title="Cell value" />
    }

    if (value instanceof Slice) {
      return <BinaryValueChip value={value} title="Slice value" />
    }

    if (typeof value === "bigint") {
      return <span className={styles.numberValue}>{value.toString()}</span>
    }

    if (typeof value === "boolean") {
      return (
        <span className={value ? styles.booleanTrue : styles.booleanFalse}>
          {value ? "true" : "false"}
        </span>
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof value === "object" && "$" in value && value.$ === "nested-object") {
      const nestedObj = value as binary.NestedObject
      return (
        <span className={styles.nestedObjectValue}>
          {nestedObj.name}
          {nestedObj.value && Object.keys(nestedObj.value).length > 0 && (
            <> (has {Object.keys(nestedObj.value).length} fields)</>
          )}
        </span>
      )
    }

    const formatted = binary.formatParsedSlice(value)
    const displayValue =
      formatted && formatted.length > 20 ? formatted.slice(0, 20) + "..." : formatted
    return (
      <span className={styles.unknownValue} title={formatted}>
        {displayValue ?? "unknown"}
      </span>
    )
  }

  const renderField = (fieldName: string, fieldValue: ParsedSlice | undefined): React.ReactNode => {
    if (fieldValue && typeof fieldValue === "object" && "$" in fieldValue) {
      const nestedObj = fieldValue as binary.NestedObject
      return (
        <div key={fieldName} className={styles.nestedFieldContainer}>
          <div className={styles.nestedFieldName}>
            <span className={styles.fieldName}>{fieldName}:</span>
            <span className={styles.structFieldType}>{nestedObj.name}</span>
          </div>
          {nestedObj.value && (
            <div className={styles.nestedStorageGroup}>
              <StorageFieldsView data={nestedObj.value} contracts={contracts} />
            </div>
          )}
        </div>
      )
    } else {
      const formattedValue = binary.formatParsedSlice(fieldValue) ?? ""

      return (
        <div key={fieldName} className={styles.storageItem}>
          <span className={styles.fieldName}>{fieldName}:</span>
          <span className={styles.fieldValue} title={formattedValue}>
            {renderValue(fieldValue)}
          </span>
        </div>
      )
    }
  }

  return (
    <div className={styles.container}>
      {Object.entries(data).map(([fieldName, fieldValue]) => renderField(fieldName, fieldValue))}
    </div>
  )
}
