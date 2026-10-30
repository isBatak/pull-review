import type { ProjectRef } from '../../shared/types'
import type { MrListParams } from '../lib/api'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

function projectKey(ref: ProjectRef | null) {
  return ref ? `${ref.host}/${ref.project}` : 'none'
}

export function useProjectInfo(ref: ProjectRef | null) {
  return useQuery({ queryKey: ['project', projectKey(ref)], queryFn: () => api.projectInfo(ref!), enabled: Boolean(ref), staleTime: 10 * 60_000 })
}

const TAGS_PER_PAGE = 50

export function useProjectTags(ref: ProjectRef | null, search: string) {
  return useInfiniteQuery({
    queryKey: ['tags', projectKey(ref), search],
    queryFn: ({ pageParam }) => api.projectTags(ref!, pageParam, TAGS_PER_PAGE, search || undefined),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length + 1 : undefined),
    enabled: Boolean(ref),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

export function useProjectViewer(ref: ProjectRef | null) {
  return useQuery({ queryKey: ['viewer', ref?.host], queryFn: () => api.projectViewer(ref!), enabled: Boolean(ref), staleTime: Infinity })
}

export function useProjectMembers(ref: ProjectRef | null) {
  return useQuery({ queryKey: ['members', projectKey(ref)], queryFn: () => api.projectMembers(ref!), enabled: Boolean(ref), staleTime: 10 * 60_000 })
}

export function useMergeRequestList(ref: ProjectRef | null, params: MrListParams, enabled = true) {
  return useQuery({
    queryKey: ['mr-list', projectKey(ref), params],
    queryFn: () => api.projectMergeRequests(ref!, params),
    enabled: Boolean(ref) && enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 120_000,
  })
}

export function useMergeRequestCounts(ref: ProjectRef | null, authorIds: number[] | undefined, enabled = true) {
  return useQuery({
    queryKey: ['mr-counts', projectKey(ref), authorIds ?? []],
    queryFn: () => api.projectCounts(ref!, authorIds),
    enabled: Boolean(ref) && enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

export function useOpenApprovals(ref: ProjectRef | null, enabled: boolean) {
  return useQuery({
    queryKey: ['mr-approvals', projectKey(ref)],
    queryFn: () => api.projectApprovals(ref!),
    enabled: Boolean(ref) && enabled,
    select: approvals => new Map(approvals.map(approval => [approval.iid, approval])),
    staleTime: 30_000,
    refetchInterval: 120_000,
  })
}
