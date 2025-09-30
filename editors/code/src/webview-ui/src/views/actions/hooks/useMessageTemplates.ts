import {useState} from "react"

import {MessageTemplate} from "../sandbox-actions-types"

interface UseMessageTemplatesReturn {
  readonly loadedTemplate: MessageTemplate | undefined
  readonly messageTemplates: MessageTemplate[]
  readonly setLoadedTemplate: (template: MessageTemplate | undefined) => void
  readonly setMessageTemplates: (templates: MessageTemplate[]) => void
}

export function useMessageTemplates(): UseMessageTemplatesReturn {
  const [loadedTemplate, setLoadedTemplate] = useState<MessageTemplate | undefined>(undefined)
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([])

  return {
    loadedTemplate,
    messageTemplates,
    setLoadedTemplate,
    setMessageTemplates,
  }
}
