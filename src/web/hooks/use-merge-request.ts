import type { BundleSettings, DiffRefs, Discussion, MrRef, NewDiffComment } from '../../shared/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mrKey } from '../../shared/mr-ref'
import { api } from '../lib/api'

const keys = {
  mr: (ref: MrRef) => ['mr', mrKey(ref)] as const,
  discussions: (ref: MrRef) => ['discussions', mrKey(ref)] as const,
  approvals: (ref: MrRef) => ['approvals', mrKey(ref)] as const,
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
