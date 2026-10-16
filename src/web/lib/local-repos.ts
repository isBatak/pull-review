import type { MrRef } from '../../shared/types'
import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { mrKey } from '../../shared/mr-ref'
import { api } from './api'
import { useSettings } from './settings'

export function useAppConfig() {
  return useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity })
}

export function projectKey(ref: Pick<MrRef, 'host' | 'project'>) {
  return `${ref.host}/${ref.project}`
}

export function mrWorkspaceKey(ref: MrRef) {
  return ['mr-workspace', mrKey(ref)] as const
}

export function useLocalRepo(ref: MrRef) {
  const [settings, updateSettings] = useSettings()
  const config = useAppConfig()
  const own = useQuery({ queryKey: mrWorkspaceKey(ref), queryFn: () => api.mrWorkspace(ref), enabled: ref.iid > 0, staleTime: 60_000, retry: false })
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
  const sharedPath = path?.trim() ? path : null
  const ownPath = own.data?.path ?? null
  return { path: ownPath ?? sharedPath, sharedPath, ownFolder: ownPath !== null, setPath, loading: config.isPending || (ref.iid > 0 && own.isPending) }
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

export function useLocalChanges(ref: MrRef, repoPath: string | null, headSha: string, branch: string) {
  return useQuery({
    queryKey: [...localChangesKey(ref, repoPath), headSha, branch],
    queryFn: () => api.localChanges(ref, repoPath!, headSha, branch),
    enabled: Boolean(repoPath),
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    retry: false,
  })
}
