import {useState} from "react"

import {MessageTemplate} from "../sandbox-actions-types"

interface UseMessageTemplatesReturn {
  readonly messageTemplates: MessageTemplate[]
  readonly setMessageTemplates: (templates: MessageTemplate[]) => void
}

export function useMessageTemplates(): UseMessageTemplatesReturn {
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([])

  return {
    messageTemplates,
    setMessageTemplates,
  }
}
