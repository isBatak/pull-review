import type {
  Approvals,
  BundleArtifacts,
  BundleSettings,
  MrCounts,
  MrListResponse,
  MrListState,
  ProjectInfo,
  ProjectRef,
  User,
  DiffRefs,
  Discussion,
  FileContentsPair,
  MrPayload,
  MrRef,
  NewDiffComment,
  Note,
} from '../../shared/types'

import { transport } from './platform'

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

type QueryRef = MrRef | ProjectRef | null

function queryFor(ref: QueryRef, extra: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams()
  if (ref) {
    params.set('host', ref.host)
    params.set('project', ref.project)
    if ('iid' in ref)
      params.set('iid', String(ref.iid))
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value)
      params.set(key, value)
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

async function call<T>(ref: QueryRef, path: string, init: { method?: string, body?: unknown, query?: Record<string, string | undefined> } = {}): Promise<T> {
  const response = await transport(
    init.method ?? 'GET',
    `/api${path}${queryFor(ref, init.query)}`,
    init.body !== undefined ? JSON.stringify(init.body) : undefined,
  )
  const data = await response.text().then(text => (text ? JSON.parse(text) : {})).catch(() => ({})) as { error?: string, code?: string }
  if (!response.ok)
    throw new ApiError(response.status, data.error ?? `Request failed with ${response.status}`, data.code)
  return data as T
}

export interface MrListParams {
  state: MrListState
  limit: number
  authorIds?: number[]
  reviewerId?: number
  search?: string
}

export const api = {
  projectInfo: (ref: ProjectRef) => call<ProjectInfo>(ref, '/project/info'),
  projectAvatar: async (ref: ProjectRef) => {
    const response = await transport('GET', `/api/project/avatar${queryFor(ref)}`)
    if (!response.ok)
      throw new ApiError(response.status, `Request failed with ${response.status}`)
    return response.blob()
  },
  projectViewer: (ref: ProjectRef) => call<User>(ref, '/project/viewer'),
  projectMembers: (ref: ProjectRef) => call<User[]>(ref, '/project/members'),
  projectMergeRequests: (ref: ProjectRef, params: MrListParams) => call<MrListResponse>(ref, '/project/merge-requests', {
    query: {
      state: params.state,
      limit: String(params.limit),
      authorIds: params.authorIds?.join(','),
      reviewerId: params.reviewerId ? String(params.reviewerId) : undefined,
      search: params.search,
    },
  }),
  projectCounts: (ref: ProjectRef, authorIds?: number[]) => call<MrCounts>(ref, '/project/counts', { query: { authorIds: authorIds?.join(',') } }),
  config: () => call<{ initialPath: string | null }>(null, '/config'),
  mergeRequest: (ref: MrRef) => call<MrPayload>(ref, '/mr'),
  discussions: (ref: MrRef) => call<Discussion[]>(ref, '/mr/discussions'),
  approvals: (ref: MrRef) => call<Approvals>(ref, '/mr/approvals'),
  approve: (ref: MrRef) => call<void>(ref, '/mr/approve', { method: 'POST' }),
  unapprove: (ref: MrRef) => call<void>(ref, '/mr/unapprove', { method: 'POST' }),
  createDiscussion: (ref: MrRef, body: string, diffRefs: DiffRefs, comment?: NewDiffComment) =>
    call<Discussion>(ref, '/mr/discussions', { method: 'POST', body: { body, diffRefs, comment } }),
  reply: (ref: MrRef, discussionId: string, body: string) =>
    call<Note>(ref, `/mr/discussions/${discussionId}/notes`, { method: 'POST', body: { body } }),
  resolve: (ref: MrRef, discussionId: string, resolved: boolean) =>
    call<Discussion>(ref, `/mr/discussions/${discussionId}/resolve`, { method: 'PUT', body: { resolved } }),
  editNote: (ref: MrRef, discussionId: string, noteId: number, body: string) =>
    call<Note>(ref, `/mr/discussions/${discussionId}/notes/${noteId}`, { method: 'PUT', body: { body } }),
  deleteNote: (ref: MrRef, discussionId: string, noteId: number) =>
    call<void>(ref, `/mr/discussions/${discussionId}/notes/${noteId}`, { method: 'DELETE' }),
  blob: async (ref: MrRef, path: string, sha: string) => {
    const response = await transport('GET', `/api/mr/blob${queryFor(ref, { path, sha })}`)
    if (!response.ok) {
      const data = await response.text().then(text => JSON.parse(text)).catch(() => ({})) as { error?: string }
      throw new ApiError(response.status, data.error ?? `Request failed with ${response.status}`)
    }
    return response.blob()
  },
  bundle: (ref: MrRef, settings: BundleSettings) => call<BundleArtifacts>(ref, '/mr/bundle', {
    query: { job: settings.jobName, base: settings.baseBranch, analysis: settings.analysisPath, modules: settings.modulesPath },
  }),
  fileContents: (ref: MrRef, diffRefs: DiffRefs, oldPath: string | null, newPath: string | null) =>
    call<FileContentsPair>(ref, '/mr/file-contents', { method: 'POST', body: { diffRefs, oldPath, newPath } }),
}
