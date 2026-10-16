import type { FindingStatus, ReviewFinding, ReviewRunInput, ReviewRunState } from '../../shared/claude-review'
import type { MrRef } from '../../shared/types'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EMPTY_REVIEW_STATE } from '../../shared/claude-review'
import { mrKey } from '../../shared/mr-ref'
import { api } from './api'

const POLL_WAIT_MS = 15_000
const RETRY_DELAY_MS = 3_000
const NO_FINDINGS: ReviewFinding[] = []

export interface ClaudeReviewControls {
  state: ReviewRunState
  current: boolean
  findingsFor: (path: string) => ReviewFinding[]
  run: (input: ReviewRunInput) => Promise<void>
  stop: () => Promise<void>
  setStatus: (ids: string[], status: FindingStatus) => Promise<void>
  setDraft: (id: string, draft: string | null) => Promise<void>
  jumpTo: (id: string) => void
}

export const ClaudeReviewContext = createContext<ClaudeReviewControls | null>(null)

export function useClaudeReviewControls() {
  return use(ClaudeReviewContext)
}

export function useClaudeReview(ref: MrRef, headSha: string, enabled: boolean): Omit<ClaudeReviewControls, 'jumpTo'> {
  const [state, setState] = useState<ReviewRunState>(EMPTY_REVIEW_STATE)
  const versionRef = useRef(0)
  const key = mrKey(ref)

  const apply = useCallback((next: ReviewRunState) => {
    if (next.version < versionRef.current)
      return
    versionRef.current = next.version
    setState(next)
  }, [])

  useEffect(() => {
    versionRef.current = 0
    setState(EMPTY_REVIEW_STATE)
  }, [key])

  useEffect(() => {
    if (!enabled)
      return
    let cancelled = false
    void (async () => {
      while (!cancelled) {
        try {
          const since = versionRef.current
          const next = await api.reviewState(ref, since, since === 0 ? 0 : POLL_WAIT_MS)
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

  const current = state.status === 'done' && state.headSha === headSha

  const queryClient = useQueryClient()
  const postedCount = state.findings.filter(finding => finding.status === 'posted').length
  useEffect(() => {
    if (postedCount)
      void queryClient.invalidateQueries({ queryKey: ['discussions', key] })
  }, [postedCount, key, queryClient])

  const byPath = useMemo(() => {
    const map = new Map<string, ReviewFinding[]>()
    if (!current)
      return map
    for (const finding of state.findings) {
      if (finding.status !== 'open')
        continue
      const list = map.get(finding.path) ?? []
      list.push(finding)
      map.set(finding.path, list)
    }
    return map
  }, [current, state.findings])

  const findingsFor = useCallback((path: string) => byPath.get(path) ?? NO_FINDINGS, [byPath])
  const run = useCallback(async (input: ReviewRunInput) => apply(await api.runReview(ref, input)), [key, apply])
  const stop = useCallback(async () => apply(await api.stopReview(ref)), [key, apply])
  const setStatus = useCallback(async (ids: string[], status: FindingStatus) => apply(await api.setFindingStatus(ref, ids, status)), [key, apply])

  const setDraft = useCallback(async (id: string, draft: string | null) => apply(await api.setFindingDraft(ref, id, draft)), [key, apply])

  return useMemo(() => ({ state, current, findingsFor, run, stop, setStatus, setDraft }), [state, current, findingsFor, run, stop, setStatus, setDraft])
}
