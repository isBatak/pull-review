import type { SavedChat, SentPrompt } from './saved-chat'
import { describe, expect, it } from 'vitest'
import { MAX_SENT_PROMPTS, packSent, rememberSent, unpackSent } from './saved-chat'

function prompt(message: string, systemPrompt = 'system'): SentPrompt {
  return { message, systemPrompt, files: [] }
}

describe('saved chat', () => {
  it('stores each distinct system prompt once and restores every message', () => {
    const sent = new Map([['a', prompt('one')], ['b', prompt('two')], ['c', prompt('three', 'other system')]])
    const packed = packSent(sent)
    expect(packed.systemPrompts).toEqual(['system', 'other system'])
    const saved = { ...packed, claudeSessionId: 'x', started: true, turnCount: 3, messages: [], updatedAt: 0 } satisfies SavedChat
    expect(unpackSent(JSON.parse(JSON.stringify(saved)) as SavedChat)).toEqual(sent)
  })

  it('keeps only the most recent sent prompts', () => {
    const sent = new Map<string, SentPrompt>()
    for (let index = 0; index < MAX_SENT_PROMPTS + 5; index++)
      rememberSent(sent, `q${index}`, prompt(String(index)))
    expect(sent.size).toBe(MAX_SENT_PROMPTS)
    expect(sent.has('q0')).toBe(false)
    expect(sent.has(`q${MAX_SENT_PROMPTS + 4}`)).toBe(true)
  })
})
