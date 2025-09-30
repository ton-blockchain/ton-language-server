import React, {useState, useEffect, useMemo} from "react"

import {VscSave, VscCheck, VscError, VscListSelection} from "react-icons/vsc"

import {Cell} from "@ton/core"

import {ContractAbi, TypeAbi} from "@shared/abi"

import {DeployedContract} from "../../../../../../common/types/contract"
import * as binary from "../../../../../../common/binary"

import {MessageTemplate, VSCodeAPI} from "../../sandbox-actions-types"
import {SendModeSelector} from "../SendModeSelector/SendModeSelector"
import {Button, Input, Select} from "../../../../components/common"
import {formatParsedSlice} from "../../../../../../common/binary"
import {AbiFieldsForm} from "../AbiFieldsForm/AbiFieldsForm"
import {Base64String} from "../../../../../../common/base64-string"

import styles from "./SendMessage.module.css"

interface MessageData {
  readonly selectedMessage: string
  readonly messageBody: Base64String
  readonly value?: string
  readonly sendMode?: number
  readonly autoDebug?: boolean
}

interface InternalMessageData extends MessageData {
  readonly fromAddress: string
}

interface Props {
  readonly contracts: DeployedContract[]
  readonly selectedContract?: string
  readonly onContractChange: (address: string) => void
  readonly onSendMessage: (messageData: MessageData) => void
  readonly onSendInternalMessage: (messageData: InternalMessageData) => void
  readonly handleShowTransactionDetails: (tx: LastTransaction) => void
  readonly result?: {success: boolean; message: string; details?: string}
  readonly onClearResult?: () => void
  readonly loadedTemplate?: MessageTemplate
  readonly messageTemplates: MessageTemplate[]
  readonly vscode: VSCodeAPI
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
  onSendInternalMessage,
  handleShowTransactionDetails,
  result,
  onClearResult,
  loadedTemplate,
  messageTemplates,
  vscode,
}) => {
  const [selectedMessage, setSelectedMessage] = useState<string>("")
  const [messageFields, setMessageFields] = useState<binary.ParsedObject>({})
  const [value, setValue] = useState<string>("1.0")
  const [sendMode, setSendMode] = useState<number>(0)
  const [lastTransaction, setLastTransaction] = useState<LastTransaction | null>(null)
  const [autoDebug, setAutoDebug] = useState<boolean>(false)
  const [isMessageFieldsValid, setMessageFieldsValid] = useState<boolean>(true)

  const [messageMode, setMessageMode] = useState<"external" | "internal">("internal")
  const [selectedFromContract, setSelectedFromContract] = useState<string>("")
  const [localMessageTemplates, setLocalMessageTemplates] = useState<MessageTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")

  const contract = contracts.find(c => c.address === selectedContract)
  const message = contract?.abi?.messages.find(m => m.name === selectedMessage)
  const hasExternalEntryPoint = contract?.abi?.externalEntryPoint !== undefined

  const availableTemplates = useMemo(() => {
    if (!message) return []
    return localMessageTemplates.filter(template => template.opcode === message.opcode)
  }, [localMessageTemplates, message])

  useEffect(() => {
    if (messageMode === "internal" && contracts.length > 0 && !selectedFromContract) {
      const treasury = contracts.find(c => c.name === "treasury")
      if (treasury) {
        setSelectedFromContract(treasury.address)
      }
    }
  }, [messageMode, contracts, selectedFromContract])

  useEffect(() => {
    onClearResult?.()
    return () => {}
  }, [messageMode, onClearResult])

  useEffect(() => {
    if (result && onClearResult) {
      const timer = setTimeout(() => {
        onClearResult()
      }, 10000)

      return () => {
        clearTimeout(timer)
      }
    }
    return () => {}
  }, [result, onClearResult])

  useEffect(() => {
    setLocalMessageTemplates(messageTemplates)
  }, [messageTemplates])

  useEffect(() => {
    const messageHandler = (event: MessageEvent): void => {
      const message = event.data as {type: string}
      if (
        message.type === "templateCreated" ||
        message.type === "templateUpdated" ||
        message.type === "templateDeleted"
      ) {
        vscode.postMessage({type: "getMessageTemplates"})
      }
    }

    window.addEventListener("message", messageHandler)
    return () => {
      window.removeEventListener("message", messageHandler)
    }
  }, [vscode])

  useEffect(() => {
    if (loadedTemplate) {
      setValue(loadedTemplate.value)
      setSendMode(loadedTemplate.sendMode)

      setMessageFields(
        parseMessageBodyToParsedObject(loadedTemplate.messageBody, message, contract?.abi),
      )
    }
  }, [loadedTemplate, selectedContract, selectedMessage, contracts, message, contract?.abi])

  useEffect(() => {
    if (selectedTemplate && localMessageTemplates.length > 0) {
      const template = localMessageTemplates.find(t => t.id === selectedTemplate)
      if (template) {
        setValue(template.value)
        setSendMode(template.sendMode)

        setMessageFields(
          parseMessageBodyToParsedObject(template.messageBody, message, contract?.abi),
        )
      }
    }
  }, [
    selectedTemplate,
    localMessageTemplates,
    selectedContract,
    selectedMessage,
    contracts,
    message,
    contract?.abi,
  ])

  useEffect(() => {
    setSelectedTemplate("")
  }, [selectedMessage])

  const parseMessageBodyToParsedObject = (
    messageBody: string,
    messageAbi: TypeAbi | undefined,
    contractAbi?: ContractAbi,
  ): binary.ParsedObject => {
    if (!messageAbi || !contractAbi) {
      return {}
    }

    try {
      const cell = Cell.fromBase64(messageBody)
      const slice = cell.beginParse()
      return binary.parseData(contractAbi, messageAbi, slice)
    } catch (error) {
      console.error("Failed to parse message body:", error)
      return {}
    }
  }

  const handleSendModeChange = (newSendMode: number): void => {
    setSendMode(newSendMode)
    if (selectedTemplate) {
      setSelectedTemplate("")
    }
  }

  const handleSaveAsTemplate = (): void => {
    if (!selectedContract || !selectedMessage) {
      return
    }

    vscode.postMessage({
      type: "saveMessageAsTemplate",
      contractAddress: selectedContract,
      messageName: selectedMessage,
      messageBody: createMessageBody(),
      sendMode,
      value,
    })
  }

  const isFormValid = (): boolean => {
    if (!selectedContract || !selectedMessage) {
      return false
    }

    if (!isMessageFieldsValid) {
      return false
    }

    if (messageMode === "external" && !hasExternalEntryPoint) {
      return false
    }

    if (messageMode === "internal") {
      if (!selectedFromContract) {
        return false
      }

      const numericValue = Number.parseFloat(value)
      if (Number.isNaN(numericValue) || numericValue <= 0) {
        return false
      }
    }

    if (message?.fields) {
      for (const field of message.fields) {
        const fieldValue = messageFields[field.name] as string | undefined
        if (fieldValue === undefined) {
          return false
        }
        if (!formatParsedSlice(fieldValue)?.trim()) {
          return false
        }
      }
    }

    return true
  }

  const createMessageBody = (): Base64String => {
    if (!message || !contract?.abi) {
      throw new Error("Message ABI not found")
    }

    try {
      const encodedCell = binary.encodeData(contract.abi, message, messageFields)
      return encodedCell.toBoc().toString("base64") as Base64String
    } catch (error) {
      throw new Error(
        `Failed to encode message: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  const handleSendMessage = (): void => {
    if (messageMode === "internal") {
      if (!selectedFromContract || !selectedContract || !selectedMessage) {
        return
      }

      setLastTransaction({
        contractAddress: selectedContract,
        methodName: selectedMessage,
        timestamp: new Date().toISOString(),
      })

      onSendInternalMessage({
        selectedMessage,
        messageBody: createMessageBody(),
        value,
        sendMode,
        autoDebug,
        fromAddress: selectedFromContract,
      })
    } else {
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
        messageBody: createMessageBody(),
        autoDebug,
      })
    }
  }

  const formatAddress = (address: string): string => {
    if (address.length <= 12) return address
    return `${address.slice(0, 6)}...${address.slice(Math.max(0, address.length - 6))}`
  }

  const hasSourceMap = contract?.sourceMap !== undefined

  return (
    <div className={styles.container}>
      <div className={styles.formGroup}>
        <div className={styles.radioGroup}>
          <div
            className={`${styles.messageModeButton} ${messageMode === "internal" ? styles.selected : ""}`}
            onClick={() => {
              setMessageMode("internal")
            }}
            onKeyDown={e => {
              if (e.key === "Enter") {
                setMessageMode("internal")
              }
            }}
            tabIndex={0}
            role="button"
            aria-label="Internal Message"
          >
            Internal Message
          </div>
          <div
            className={`${styles.messageModeButton} ${messageMode === "external" ? styles.selected : ""}`}
            onClick={() => {
              setMessageMode("external")
              setSelectedFromContract("")
            }}
            onKeyDown={e => {
              if (e.key === "Enter") {
                setMessageMode("external")
                setSelectedFromContract("")
              }
            }}
            tabIndex={0}
            role="button"
            aria-label="External Message"
          >
            External Message
          </div>
        </div>
      </div>

      {messageMode === "internal" && (
        <div className={styles.formGroup}>
          <Select
            label="Source Contract:"
            id="sourceContractSelect"
            value={selectedFromContract}
            onChange={e => {
              setSelectedFromContract(e.target.value)
            }}
          >
            <option value="">Select source contract...</option>
            {contracts.map(contract => (
              <option key={contract.address} value={contract.address}>
                {contract.name} ({formatAddress(contract.address)})
              </option>
            ))}
          </Select>
        </div>
      )}

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
          {contracts
            .filter(
              contract => messageMode !== "internal" || contract.address !== selectedFromContract,
            )
            .map(contract => (
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
              {msg.name} (opcode: 0x{msg.opcode?.toString(16)})
            </option>
          ))}
        </Select>
      </div>

      {availableTemplates.length > 0 && (
        <div className={styles.formGroup}>
          <Select
            label="Template:"
            id="templateSelect"
            value={selectedTemplate}
            onChange={e => {
              setSelectedTemplate(e.target.value)
            }}
          >
            <option value="">Select template...</option>
            {availableTemplates.map(template => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <AbiFieldsForm
        abi={message}
        contractAbi={contract?.abi}
        contracts={contracts}
        fields={messageFields}
        onFieldsChange={setMessageFields}
        onValidationChange={setMessageFieldsValid}
      />

      {!contract?.abi?.messages && selectedContract && (
        <div className={styles.noMessages}>No messages available for this contract</div>
      )}

      {messageMode === "external" && selectedContract && !hasExternalEntryPoint && (
        <div className={styles.externalMessageError}>
          <div className={styles.errorTitle}>
            <span className={styles.errorIcon}>⚠</span>
            External messages not supported
          </div>
          <div className={styles.errorMessage}>
            This contract doesn&apos;t have an external message handler (onExternalMessage
            function). External messages cannot be sent to this contract.
          </div>
        </div>
      )}

      {messageMode === "internal" && (
        <>
          <div className={styles.formGroup}>
            <Input
              label="Value (TON):"
              type="text"
              id="sendValue"
              value={value}
              onChange={e => {
                const newValue = e.target.value
                const numericValue = Number.parseFloat(newValue)
                if (!Number.isNaN(numericValue) && numericValue >= 0) {
                  setValue(newValue)
                } else if (newValue === "" || newValue === ".") {
                  setValue(newValue)
                }
                if (selectedTemplate) {
                  setSelectedTemplate("")
                }
              }}
              placeholder="1.0"
            />
          </div>

          <div className={styles.formGroup}>
            <SendModeSelector sendMode={sendMode} onSendModeChange={handleSendModeChange} />
          </div>
        </>
      )}

      <div className={styles.formGroup}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={autoDebug}
            onChange={e => {
              setAutoDebug(e.target.checked)
              if (selectedTemplate) {
                setSelectedTemplate("")
              }
            }}
            className={styles.checkbox}
            disabled={!hasSourceMap}
            id="autoDebugCheckbox"
          />
          <span className={styles.checkboxMark}></span>
          <span className={styles.checkboxText}>Launch debugger after send</span>
        </label>
      </div>

      {result && (
        <div className={styles.resultContainer}>
          <div className={`${styles.result} ${result.success ? styles.success : styles.error}`}>
            <div className={styles.resultHeader}>
              <div className={styles.resultIcon}>
                {result.success ? <VscCheck /> : <VscError />}
              </div>
              <div className={styles.resultTitle}>
                {result.success ? "Message sent successfully" : "Failed to send message"}
              </div>
            </div>
            <div className={styles.resultMessage}>{result.message}</div>
            {result.details && <div className={styles.resultDetails}>{result.details}</div>}
            {result.success && lastTransaction && (
              <div className={styles.resultActions}>
                <button
                  onClick={() => {
                    handleShowTransactionDetails(lastTransaction)
                  }}
                  className={styles.transactionDetailsButton}
                  type="button"
                >
                  <VscListSelection />
                  Show Transaction Details
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.buttonRow}>
        <Button onClick={handleSendMessage} disabled={!isFormValid()}>
          Send Message
        </Button>
        <Button
          onClick={handleSaveAsTemplate}
          disabled={contracts.length === 0 || !selectedContract || !selectedMessage}
          className={styles.saveTemplateButton}
        >
          <VscSave size={14} className={styles.saveIcon} />
          Save as Template
        </Button>
      </div>
    </div>
  )
}
