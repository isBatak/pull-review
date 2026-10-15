import type { ChatMessage } from '../../shared/chat'

export const MAX_SENT_PROMPTS = 50

export interface SentPrompt {
  message: string
  systemPrompt: string
  files: string[]
}

interface SavedSentPrompt {
  message: string
  systemPrompt: number
  files: string[]
}

export interface SavedChat {
  claudeSessionId: string
  started: boolean
  turnCount: number
  messages: ChatMessage[]
  systemPrompts: string[]
  sent: Record<string, SavedSentPrompt>
  seenContext?: Record<string, string>
  updatedAt: number
}

export function packSent(sent: Map<string, SentPrompt>) {
  const systemPrompts: string[] = []
  const packed: Record<string, SavedSentPrompt> = {}
  for (const [id, prompt] of sent) {
    let index = systemPrompts.indexOf(prompt.systemPrompt)
    if (index === -1)
      index = systemPrompts.push(prompt.systemPrompt) - 1
    packed[id] = { message: prompt.message, systemPrompt: index, files: prompt.files }
  }
  return { systemPrompts, sent: packed }
}

export function unpackSent(saved: SavedChat | null) {
  const sent = new Map<string, SentPrompt>()
  for (const [id, prompt] of Object.entries(saved?.sent ?? {}))
    sent.set(id, { message: prompt.message, systemPrompt: saved?.systemPrompts?.[prompt.systemPrompt] ?? '', files: prompt.files })
  return sent
}

export function rememberSent(sent: Map<string, SentPrompt>, id: string, prompt: SentPrompt) {
  sent.set(id, prompt)
  for (const oldest of sent.keys()) {
    if (sent.size <= MAX_SENT_PROMPTS)
      break
    sent.delete(oldest)
  }
}
