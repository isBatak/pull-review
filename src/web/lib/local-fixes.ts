import type { FixTarget, LocalFix } from '../../shared/local-changes'
import type { MrRef } from '../../shared/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { readLocalFix } from '../../shared/local-changes'
import { mrKey } from '../../shared/mr-ref'
import { api } from './api'

const NO_FIXES: LocalFix[] = []
const migrating = new Set<string>()

function browserKey(ref: MrRef) {
  return `pull-review:local-fixes:${mrKey(ref)}`
}

function takeBrowserFixes(ref: MrRef) {
  try {
    const raw = localStorage.getItem(browserKey(ref))
    if (!raw)
      return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.flatMap(fix => readLocalFix(fix) ?? []) : []
  }
  catch {
    return []
  }
}

function forgetBrowserFixes(ref: MrRef) {
  try {
    localStorage.removeItem(browserKey(ref))
  }
  catch {}
}

export function useLocalFixes(ref: MrRef) {
  const queryClient = useQueryClient()
  const key = ['local-fixes', mrKey(ref)] as const
  const query = useQuery({ queryKey: key, queryFn: () => api.localFixes(ref), staleTime: 30_000 })
  const store = (fixes: LocalFix[]) => queryClient.setQueryData(key, fixes)

  const add = useMutation({ mutationFn: (fixes: LocalFix[]) => api.addLocalFixes(ref, fixes), onSuccess: store })
  const remove = useMutation({ mutationFn: (target: FixTarget) => api.removeLocalFix(ref, target), onSuccess: store })

  useEffect(() => {
    const id = mrKey(ref)
    if (!query.isSuccess || migrating.has(id))
      return
    const saved = takeBrowserFixes(ref)
    if (!saved.length)
      return
    migrating.add(id)
    api.addLocalFixes(ref, saved).then((fixes) => {
      store(fixes)
      forgetBrowserFixes(ref)
    }).catch(() => null).finally(() => migrating.delete(id))
  }, [query.isSuccess, mrKey(ref)])

  const addFix = useCallback((fix: Omit<LocalFix, 'appliedAt'>) => {
    if (fix.discussionIds.length || fix.findingIds.length)
      add.mutate([{ ...fix, appliedAt: Date.now() }])
  }, [add.mutate])

  return {
    fixes: query.data ?? NO_FIXES,
    addFix,
    removeFix: remove.mutateAsync,
    busy: add.isPending || remove.isPending,
  }
}
