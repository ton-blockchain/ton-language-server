import {useState} from "react"

import {MessageTemplate} from "../sandbox-actions-types"

interface UseMessageTemplatesReturn {
  readonly loadedTemplate: MessageTemplate | null
  readonly messageTemplates: MessageTemplate[]
  readonly setLoadedTemplate: (template: MessageTemplate | null) => void
  readonly setMessageTemplates: (templates: MessageTemplate[]) => void
}

export function useMessageTemplates(): UseMessageTemplatesReturn {
  const [loadedTemplate, setLoadedTemplate] = useState<MessageTemplate | null>(null)
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([])

  return {
    loadedTemplate,
    messageTemplates,
    setLoadedTemplate,
    setMessageTemplates,
  }
}
