import React, {useState} from "react"
import {Button, Input, Select} from "./ui"
import styles from "./GetMethod.module.css"
import {DeployedContract} from "../../../providers/lib/contract"
import {AbiFieldsForm} from "./AbiFieldsForm"
import * as binary from "../../../providers/binary"
import {TypeAbi} from "@shared/abi"
import {encodeTuple} from "../../../providers/binary"
import {serializeTuple} from "@ton/core"
import {Base64String} from "../../../common/base64-string"

interface MethodData {
    readonly selectedMethod: string
    readonly methodId: string
    readonly parameters: Base64String
}

interface Props {
    readonly contracts: DeployedContract[]
    readonly selectedContract?: string
    readonly onContractChange: (address: string) => void
    readonly onCallGetMethod: (methodData: MethodData) => void
    readonly result?: {success: boolean; message: string; details?: string}
}

export const GetMethod: React.FC<Props> = ({
    contracts,
    selectedContract,
    onContractChange,
    onCallGetMethod,
    result,
}) => {
    const [selectedMethod, setSelectedMethod] = useState<string>("")
    const [methodId, setMethodId] = useState<string>("0")
    const [methodParameters, setMethodParameters] = useState<binary.ParsedObject>({})
    const [isParametersValid, setParametersValid] = useState<boolean>(true)

    const contract = contracts.find(c => c.address === selectedContract)
    const method = contract?.abi?.getMethods.find(m => m.name === selectedMethod)

    const methodParamsAbi: TypeAbi | undefined = method?.parameters
        ? {
              name: `${method.name}_params`,
              opcode: undefined,
              opcodeWidth: undefined,
              fields: method.parameters,
          }
        : undefined

    const handleMethodChange = (methodName: string): void => {
        setSelectedMethod(methodName)
        setMethodParameters({})
        const method = contract?.abi?.getMethods.find(m => m.name === methodName)
        if (method) {
            setMethodId(method.id.toString())
        } else {
            setMethodId("0")
        }
    }

    const handleCallGetMethod = (): void => {
        if (!selectedContract) {
            return
        }

        const encodedParameters =
            methodParamsAbi && contract?.abi
                ? encodeTuple(contract.abi, methodParamsAbi, methodParameters)
                : []

        const encodedParametersCell = serializeTuple(encodedParameters)

        onCallGetMethod({
            selectedMethod,
            methodId,
            parameters: encodedParametersCell.toBoc().toString("base64") as Base64String,
        })
    }

    const formatAddress = (address: string): string => {
        if (address.length <= 12) return address
        return `${address.slice(0, 6)}...${address.slice(Math.max(0, address.length - 6))}`
    }

    const isMethodIdReadonly = Boolean(method)

    return (
        <div className={styles.container}>
            <div className={styles.formGroup}>
                <Select
                    label="Target Contract:"
                    id="getContractSelect"
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
                    label="Get Method:"
                    id="methodSelect"
                    value={selectedMethod}
                    onChange={e => {
                        handleMethodChange(e.target.value)
                    }}
                    disabled={!contract?.abi?.getMethods}
                >
                    <option value="">Select method...</option>
                    {contract?.abi?.getMethods.map(method => (
                        <option key={method.name} value={method.name}>
                            {method.name} (ID: 0x{method.id.toString(16)})
                        </option>
                    ))}
                </Select>
            </div>

            <div className={styles.formGroup}>
                <Input
                    label="Method ID:"
                    type="number"
                    id="methodId"
                    value={methodId}
                    onChange={e => {
                        setMethodId(e.target.value)
                    }}
                    placeholder="0"
                    readOnly={isMethodIdReadonly}
                    className={isMethodIdReadonly ? styles.readonly : ""}
                />
            </div>

            {methodParamsAbi && methodParamsAbi.fields.length > 0 && (
                <div className={styles.formGroup}>
                    <div className={styles.parametersTitle}>Method Parameters:</div>
                    <AbiFieldsForm
                        abi={methodParamsAbi}
                        contractAbi={contract?.abi}
                        contracts={contracts}
                        fields={methodParameters}
                        onFieldsChange={setMethodParameters}
                        onValidationChange={setParametersValid}
                    />
                </div>
            )}

            <Button
                onClick={handleCallGetMethod}
                disabled={contracts.length === 0 || !isParametersValid}
            >
                Call Get Method
            </Button>

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
