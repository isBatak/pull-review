import type { ChatCodeContext, ChatState } from '../../shared/chat'
import type { SuggestionDraft } from '../../shared/suggestions'
import type { MrRef } from '../../shared/types'
import { useQuery } from '@tanstack/react-query'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EMPTY_CHAT_STATE } from '../../shared/chat'
import { mrKey } from '../../shared/mr-ref'
import { api } from './api'

const POLL_WAIT_MS = 15_000
const RETRY_DELAY_MS = 3_000

export function useChatAvailable() {
  const query = useQuery({ queryKey: ['chat-status'], queryFn: api.chatStatus, staleTime: Infinity, retry: false })
  return query.data?.available === true
}

export function useChatSession(ref: MrRef, enabled: boolean) {
  const [state, setState] = useState<ChatState>(EMPTY_CHAT_STATE)
  const versionRef = useRef(0)
  const key = mrKey(ref)

  const apply = useCallback((next: ChatState) => {
    if (next.version < versionRef.current)
      return
    versionRef.current = next.version
    setState(next)
  }, [])

  useEffect(() => {
    versionRef.current = 0
    setState(EMPTY_CHAT_STATE)
  }, [key])

  useEffect(() => {
    if (!enabled)
      return
    let cancelled = false
    void (async () => {
      while (!cancelled) {
        try {
          const since = versionRef.current
          const next = await api.chatState(ref, since, since === 0 ? 0 : POLL_WAIT_MS)
          if (!cancelled)
            apply(next)
        }
        catch {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, key])

  return { state, apply }
}

export interface ChatControls {
  open: boolean
  setOpen: (open: boolean) => void
  autoSelection: boolean
  addContext: (context: ChatCodeContext) => void
  setSelection: (owner: string, context: ChatCodeContext | null) => void
  suggestionDrafts: OpenSuggestion[]
  openSuggestions: (drafts: SuggestionDraft[]) => void
  closeSuggestion: (id: string) => void
}

export interface OpenSuggestion extends SuggestionDraft {
  id: string
  first: boolean
}

export interface ChatDraft {
  contexts: ChatCodeContext[]
  selection: ChatCodeContext | null
  removeContext: (index: number) => void
  dismissSelection: () => void
  clear: () => void
}

export const ChatContext = createContext<ChatControls | null>(null)
export const ChatDraftContext = createContext<ChatDraft | null>(null)

export function useChatControls() {
  return use(ChatContext)
}

export function useChatDraft() {
  const draft = use(ChatDraftContext)
  if (!draft)
    throw new Error('useChatDraft must be used inside ChatDraftContext')
  return draft
}

export function sameContext(a: ChatCodeContext, b: ChatCodeContext) {
  return a.path === b.path && a.side === b.side && a.startLine === b.startLine && a.endLine === b.endLine
}

interface OwnedSelection {
  owner: string
  context: ChatCodeContext
}

export function useChatState(open: boolean, setOpen: (open: boolean) => void, autoSelection: boolean) {
  const [contexts, setContexts] = useState<ChatCodeContext[]>([])
  const [selection, setSelectionState] = useState<OwnedSelection | null>(null)
  const [suggestionDrafts, setSuggestionDrafts] = useState<OpenSuggestion[]>([])

  const openSuggestions = useCallback((drafts: SuggestionDraft[]) => {
    setSuggestionDrafts(current => [
      ...current.map(draft => ({ ...draft, first: false })),
      ...drafts
        .filter(draft => !current.some(open => open.path === draft.path && (open.side ?? 'additions') === (draft.side ?? 'additions') && open.line === draft.line))
        .map((draft, index) => ({ ...draft, id: crypto.randomUUID(), first: index === 0 })),
    ])
  }, [])
  const closeSuggestion = useCallback((id: string) => setSuggestionDrafts(current => current.filter(draft => draft.id !== id)), [])

  const addContext = useCallback((context: ChatCodeContext) => {
    setContexts(current => current.some(item => sameContext(item, context)) ? current : [...current, context])
    setSelectionState(current => current && sameContext(current.context, context) ? null : current)
    setOpen(true)
  }, [setOpen])

  const setSelection = useCallback((owner: string, context: ChatCodeContext | null) => {
    setSelectionState((current) => {
      if (context)
        return { owner, context }
      return current?.owner === owner ? null : current
    })
  }, [])

  const removeContext = useCallback((index: number) => setContexts(current => current.filter((_, position) => position !== index)), [])
  const dismissSelection = useCallback(() => setSelectionState(null), [])
  const clear = useCallback(() => {
    setContexts([])
    setSelectionState(null)
  }, [])

  const controls = useMemo<ChatControls>(
    () => ({ open, setOpen, autoSelection, addContext, setSelection, suggestionDrafts, openSuggestions, closeSuggestion }),
    [open, setOpen, autoSelection, addContext, setSelection, suggestionDrafts, openSuggestions, closeSuggestion],
  )

  useEffect(() => {
    if (!autoSelection)
      setSelectionState(null)
  }, [autoSelection])
  const visibleSelection = selection && !contexts.some(item => sameContext(item, selection.context)) ? selection.context : null
  const draft = useMemo<ChatDraft>(
    () => ({ contexts, selection: visibleSelection, removeContext, dismissSelection, clear }),
    [contexts, visibleSelection, removeContext, dismissSelection, clear],
  )
  return { controls, draft }
}
