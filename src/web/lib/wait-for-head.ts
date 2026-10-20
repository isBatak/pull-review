import type { QueryClient } from '@tanstack/react-query'
import type { MrRef } from '../../shared/types'
import { mrKey } from '../../shared/mr-ref'
import { mergeStatusKey } from '../hooks/use-merge-request'
import { api } from './api'
import { localChangesKey } from './local-repos'

const POLL_MS = 2_000
const POLL_TRIES = 30

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function waitForHead(queryClient: QueryClient, mrRef: MrRef, repoPath: string | null, sha: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: localChangesKey(mrRef, repoPath) }),
    queryClient.invalidateQueries({ queryKey: ['mr', mrKey(mrRef)] }),
  ])
  for (let attempt = 0; attempt < POLL_TRIES; attempt++) {
    const status = await api.mergeStatus(mrRef)
    queryClient.setQueryData(mergeStatusKey(mrRef), status)
    if (status.headSha === sha)
      return
    await wait(POLL_MS)
  }
}
