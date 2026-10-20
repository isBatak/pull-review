import type { BundleSettings, DiffRefs, Discussion, MergeStatus, MrRef, NewDiffComment } from '../../shared/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mrKey } from '../../shared/mr-ref'
import { summarizeMergeStatus } from '../../shared/merge-status'
import { api } from '../lib/api'

const keys = {
  mr: (ref: MrRef) => ['mr', mrKey(ref)] as const,
  discussions: (ref: MrRef) => ['discussions', mrKey(ref)] as const,
  approvals: (ref: MrRef) => ['approvals', mrKey(ref)] as const,
  mergeStatus: (ref: MrRef) => ['merge-status', mrKey(ref)] as const,
}

export function useMergeRequest(ref: MrRef) {
  return useQuery({ queryKey: keys.mr(ref), queryFn: () => api.mergeRequest(ref), staleTime: 60_000 })
}

export function useDiscussions(ref: MrRef) {
  return useQuery({ queryKey: keys.discussions(ref), queryFn: () => api.discussions(ref), refetchInterval: 60_000 })
}

export function useBundleArtifacts(ref: MrRef, settings: BundleSettings, enabled: boolean) {
  return useQuery({
    queryKey: ['bundle', mrKey(ref), settings.jobName, settings.baseBranch, settings.analysisPath, settings.modulesPath],
    queryFn: () => api.bundle(ref, settings),
    enabled,
    staleTime: 5 * 60_000,
  })
}

export function useApprovals(ref: MrRef) {
  return useQuery({ queryKey: keys.approvals(ref), queryFn: () => api.approvals(ref) })
}

function useReplaceDiscussion(ref: MrRef) {
  const queryClient = useQueryClient()
  return (discussion: Discussion) => {
    queryClient.setQueryData<Discussion[]>(keys.discussions(ref), (current = []) => {
      const index = current.findIndex(item => item.id === discussion.id)
      if (index === -1)
        return [...current, discussion]
      const next = [...current]
      next[index] = discussion
      return next
    })
  }
}

export function useDiscussionActions(ref: MrRef, diffRefs: DiffRefs | undefined) {
  const queryClient = useQueryClient()
  const replace = useReplaceDiscussion(ref)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.discussions(ref) })

  const create = useMutation({
    mutationFn: ({ body, comment }: { body: string, comment?: NewDiffComment }) => {
      if (!diffRefs)
        throw new Error('Merge request is still loading')
      return api.createDiscussion(ref, body, diffRefs, comment)
    },
    onSuccess: replace,
  })

  const reply = useMutation({
    mutationFn: ({ discussionId, body }: { discussionId: string, body: string }) => api.reply(ref, discussionId, body),
    onSuccess: invalidate,
  })

  const resolve = useMutation({
    mutationFn: ({ discussionId, resolved }: { discussionId: string, resolved: boolean }) =>
      api.resolve(ref, discussionId, resolved),
    onSuccess: replace,
  })

  const edit = useMutation({
    mutationFn: ({ discussionId, noteId, body }: { discussionId: string, noteId: number, body: string }) =>
      api.editNote(ref, discussionId, noteId, body),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: ({ discussionId, noteId }: { discussionId: string, noteId: number }) =>
      api.deleteNote(ref, discussionId, noteId),
    onSuccess: invalidate,
  })

  return { create, reply, resolve, edit, remove }
}

export function useApprovalActions(ref: MrRef) {
  const queryClient = useQueryClient()
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: keys.approvals(ref) })
  const approve = useMutation({ mutationFn: () => api.approve(ref), onSuccess })
  const unapprove = useMutation({ mutationFn: () => api.unapprove(ref), onSuccess })
  return { approve, unapprove }
}

export const mergeStatusKey = keys.mergeStatus

const BUSY_POLL_MS = 5_000
const IDLE_POLL_MS = 30_000

export function useMergeStatus(ref: MrRef) {
  return useQuery({
    queryKey: keys.mergeStatus(ref),
    queryFn: () => api.mergeStatus(ref),
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data)
        return IDLE_POLL_MS
      const tone = summarizeMergeStatus(data).tone
      if (tone === 'done' || tone === 'idle')
        return false
      return tone === 'work' ? BUSY_POLL_MS : IDLE_POLL_MS
    },
  })
}

export function useMergeActions(ref: MrRef) {
  const queryClient = useQueryClient()
  const onSuccess = (status: MergeStatus) => {
    queryClient.setQueryData(keys.mergeStatus(ref), status)
    void queryClient.invalidateQueries({ queryKey: keys.mr(ref) })
  }
  const merge = useMutation({
    mutationFn: ({ sha, autoMerge }: { sha: string, autoMerge: boolean }) => api.merge(ref, sha, autoMerge),
    onSuccess,
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.mergeStatus(ref) }),
  })
  const cancelAutoMerge = useMutation({ mutationFn: () => api.cancelAutoMerge(ref), onSuccess })
  return { merge, cancelAutoMerge }
}
