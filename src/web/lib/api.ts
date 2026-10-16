import type { CreatedWorkspace } from '../../shared/local-repo'
import type { CommitDetails, FixTarget, LocalFix } from '../../shared/local-changes'
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

import type { ChatPromptView, ChatSendInput, ChatState } from '../../shared/chat'
import type { FindingStatus, ReviewRunInput, ReviewRunState } from '../../shared/claude-review'
import type { CommitPlan, CommitPlanInput, CommitResult, PlannedCommit } from '../../shared/commit-plan'
import type { LocalChanges } from '../../shared/local-changes'
import type { LocalCheckout, LocalFolderInfo } from '../../shared/local-repo'
import type { SymbolHit } from '../../shared/symbols'
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

export interface AppConfig {
  initialPath: string | null
  localRepo: { host: string, project: string, path: string } | null
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
  config: () => call<AppConfig>(null, '/config'),
  chatStatus: () => call<{ available: boolean }>(null, '/chat/status'),
  inspectLocalFolder: (input: { path: string, project: string }) => call<LocalFolderInfo>(null, '/local/inspect', { method: 'POST', body: input }),
  createLocalWorktree: (input: { sourcePath: string, targetPath: string, project: string }) =>
    call<{ path: string }>(null, '/local/worktree', { method: 'POST', body: input }),
  mrWorkspace: (ref: MrRef) => call<{ path: string | null }>(ref, '/mr/local/workspace'),
  createMrWorkspace: (ref: MrRef, input: { repoPath: string, move: boolean }) => call<CreatedWorkspace>(ref, '/mr/local/workspace', { method: 'POST', body: input }),
  localChanges: (ref: MrRef, repoPath: string, headSha: string, branch: string) => call<LocalChanges>(ref, '/mr/local/changes', { query: { repoPath, headSha, branch } }),
  planCommits: (ref: MrRef, input: CommitPlanInput) => call<CommitPlan>(ref, '/mr/local/commit-plan', { method: 'POST', body: input }),
  commitLocalChanges: (ref: MrRef, input: { repoPath: string, commits: PlannedCommit[], push: boolean, skipHooks: boolean }) =>
    call<CommitResult>(ref, '/mr/local/commit', { method: 'POST', body: input }),
  pushLocalCommits: (ref: MrRef, repoPath: string) => call<{ pushed: boolean }>(ref, '/mr/local/push', { method: 'POST', body: { repoPath } }),
  discardLocalChanges: (ref: MrRef, repoPath: string, paths: string[] | null) =>
    call<{ discarded: string[] }>(ref, '/mr/local/discard', { method: 'POST', body: { repoPath, paths } }),
  unpushedCommit: (ref: MrRef, repoPath: string, headSha: string, sha: string) => call<CommitDetails>(ref, '/mr/local/commit', { query: { repoPath, headSha, sha } }),
  localFixes: (ref: MrRef) => call<LocalFix[]>(ref, '/mr/local/fixes'),
  addLocalFixes: (ref: MrRef, fixes: LocalFix[]) => call<LocalFix[]>(ref, '/mr/local/fixes', { method: 'POST', body: { fixes } }),
  removeLocalFix: (ref: MrRef, target: FixTarget) => call<LocalFix[]>(ref, '/mr/local/fixes/remove', { method: 'POST', body: target }),
  applyPatch: (ref: MrRef, repoPath: string, patch: string) =>
    call<{ path: string, files: string[], alreadyApplied: boolean }>(ref, '/mr/local/apply-patch', { method: 'POST', body: { repoPath, patch } }),
  checkoutLocal: (ref: MrRef, repoPath: string) => call<LocalCheckout>(ref, '/mr/local/checkout', { method: 'POST', body: { repoPath } }),
  editorStatus: () => call<{ detected: string | null, installed: string[] }>(null, '/editor'),
  openInEditor: (input: { repoPath: string, path: string, line: number, column: number, editor: string }) =>
    call<{ editor: string }>(null, '/editor/open', { method: 'POST', body: input }),
  symbols: (ref: MrRef, input: { name: string, sha: string, repoPath: string }) =>
    call<{ hits: SymbolHit[], truncated: boolean }>(ref, '/mr/symbols', { query: input }),
  chatState: (ref: MrRef, since: number, wait: number) => call<ChatState>(ref, '/mr/chat/state', { query: { since: String(since), wait: String(wait) } }),
  chatPrepare: (ref: MrRef, repoPath: string | null) => call<ChatState>(ref, '/mr/chat/prepare', { method: 'POST', body: { repoPath } }),
  chatSend: (ref: MrRef, input: ChatSendInput) => call<ChatState>(ref, '/mr/chat/messages', { method: 'POST', body: input }),
  chatPreview: (ref: MrRef, input: ChatSendInput) => call<ChatPromptView>(ref, '/mr/chat/preview', { method: 'POST', body: input }),
  chatSent: (ref: MrRef, messageId: string) => call<ChatPromptView>(ref, '/mr/chat/sent', { query: { messageId } }),
  chatStop: (ref: MrRef) => call<ChatState>(ref, '/mr/chat/stop', { method: 'POST' }),
  chatReset: (ref: MrRef) => call<ChatState>(ref, '/mr/chat/reset', { method: 'POST' }),
  reviewState: (ref: MrRef, since: number, wait: number) => call<ReviewRunState>(ref, '/mr/review/state', { query: { since: String(since), wait: String(wait) } }),
  runReview: (ref: MrRef, input: ReviewRunInput) => call<ReviewRunState>(ref, '/mr/review/run', { method: 'POST', body: input }),
  stopReview: (ref: MrRef) => call<ReviewRunState>(ref, '/mr/review/stop', { method: 'POST' }),
  setFindingStatus: (ref: MrRef, ids: string[], status: FindingStatus) => call<ReviewRunState>(ref, '/mr/review/findings', { method: 'POST', body: { ids, status } }),
  setFindingDraft: (ref: MrRef, id: string, draft: string | null) => call<ReviewRunState>(ref, '/mr/review/findings/draft', { method: 'POST', body: { id, draft } }),
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
