import type { MrRef } from '../../shared/types'
import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api } from './api'
import { useSettings } from './settings'

export function useAppConfig() {
  return useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity })
}

export function projectKey(ref: Pick<MrRef, 'host' | 'project'>) {
  return `${ref.host}/${ref.project}`
}

export function useLocalRepo(ref: MrRef) {
  const [settings, updateSettings] = useSettings()
  const config = useAppConfig()
  const key = projectKey(ref)
  const saved = settings.localRepos[key]
  const detected = config.data?.localRepo
  const detectedPath = detected && detected.project.toLowerCase() === ref.project.toLowerCase() ? detected.path : null
  const path = saved ?? detectedPath
  const setPath = useCallback((next: string | null) => {
    const localRepos = { ...settings.localRepos }
    if (next?.trim())
      localRepos[key] = next.trim()
    else
      localRepos[key] = ''
    updateSettings({ localRepos })
  }, [settings.localRepos, key, updateSettings])
  return { path: path?.trim() ? path : null, setPath, loading: config.isPending }
}

export function useLocalCheckout(ref: MrRef, repoPath: string | null, headSha: string) {
  return useQuery({
    queryKey: ['local-checkout', ref.host, ref.project, ref.iid, headSha, repoPath],
    queryFn: () => api.checkoutLocal(ref, repoPath!),
    enabled: Boolean(repoPath),
    staleTime: Infinity,
    retry: false,
  })
}

export function localChangesKey(ref: MrRef, repoPath: string | null) {
  return ['local-changes', ref.host, ref.project, ref.iid, repoPath] as const
}

export function useLocalChanges(ref: MrRef, repoPath: string | null, headSha: string) {
  return useQuery({
    queryKey: [...localChangesKey(ref, repoPath), headSha],
    queryFn: () => api.localChanges(ref, repoPath!, headSha),
    enabled: Boolean(repoPath),
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    retry: false,
  })
}
