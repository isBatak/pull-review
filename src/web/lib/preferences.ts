import type { DiffFile, MrRef } from '../../shared/types'
import { useCallback, useEffect } from 'react'
import { mrKey } from '../../shared/mr-ref'
import { useStoredState } from './stored-state'

export type DiffLayout = 'split' | 'unified'
export type ThemeMode = 'light' | 'dark'

export function useDiffLayout() {
  return useStoredState<DiffLayout>('pull-review:layout', 'split')
}

export function useWrapLines() {
  return useStoredState<boolean>('pull-review:wrap', false)
}

function systemTheme(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const [stored, setStored] = useStoredState<ThemeMode | null>('pull-review:theme', null)
  const theme = stored ?? systemTheme()
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  return [theme, setStored]
}

export function hashDiff(text: string): string {
  let hash = 0x811C9DC5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export type ReviewStatus = 'unreviewed' | 'reviewed' | 'changed'

export function useReviewedFiles(ref: MrRef) {
  const [marks, setMarks] = useStoredState<Record<string, string>>(`pull-review:reviewed:${mrKey(ref)}`, {})

  const statusOf = useCallback((file: DiffFile): ReviewStatus => {
    const mark = marks[file.path]
    if (!mark)
      return 'unreviewed'
    return mark === hashDiff(file.diff) ? 'reviewed' : 'changed'
  }, [marks])

  const setReviewed = useCallback((files: DiffFile[], reviewed: boolean) => {
    const next = { ...marks }
    for (const file of files) {
      if (reviewed)
        next[file.path] = hashDiff(file.diff)
      else
        delete next[file.path]
    }
    setMarks(next)
  }, [marks, setMarks])

  return { statusOf, setReviewed }
}
