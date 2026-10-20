import type {
  Approvals,
  BundleArtifacts,
  BundleArtifactSide,
  BundleSettings,
  DiffFile,
  DiffLinePosition,
  DiffRefs,
  Discussion,
  FileContentsPair,
  MergeRequest,
  MergeStatus,
  MrRef,
  NewDiffComment,
  Note,
  NotePosition,
  User,
} from '../shared/types'
import type { MergeMethod } from '../shared/conflicts'
import { trimAnalyzerNodes } from '../shared/bundle'
import { countChanges, sideForPosition } from '../shared/line-map'

export class GitlabError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export interface RawUser {
  id: number
  username: string
  name: string
  avatar_url: string | null
  web_url: string
}

interface RawDiff {
  old_path: string
  new_path: string
  a_mode: string
  b_mode: string
  new_file: boolean
  renamed_file: boolean
  deleted_file: boolean
  diff: string
  too_large?: boolean
  collapsed?: boolean
  generated_file?: boolean
}

interface RawPosition {
  old_path: string
  new_path: string
  old_line: number | null
  new_line: number | null
  head_sha: string
  position_type: string
}

interface RawNote {
  id: number
  type: string | null
  body: string
  author: RawUser
  created_at: string
  updated_at: string
  system: boolean
  resolvable: boolean
  resolved?: boolean
  resolved_by?: RawUser | null
  position?: RawPosition | null
}

interface RawDiscussion {
  id: string
  individual_note: boolean
  notes: RawNote[]
}

export function normalizeUser(user: RawUser): User {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    avatarUrl: user.avatar_url,
    webUrl: user.web_url,
  }
}

function normalizePosition(position: RawPosition | null | undefined): NotePosition | null {
  if (!position || position.position_type !== 'text')
    return null
  const anchor = sideForPosition(position.old_line, position.new_line)
  if (!anchor)
    return null
  return {
    oldPath: position.old_path,
    newPath: position.new_path,
    oldLine: position.old_line,
    newLine: position.new_line,
    headSha: position.head_sha,
    ...anchor,
  }
}

function normalizeNote(note: RawNote): Note {
  return {
    id: note.id,
    body: note.body,
    author: normalizeUser(note.author),
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    system: note.system,
    resolvable: note.resolvable,
    resolved: note.resolved ?? false,
    resolvedBy: note.resolved_by ? normalizeUser(note.resolved_by) : null,
    position: normalizePosition(note.position),
  }
}

function normalizeDiscussion(discussion: RawDiscussion): Discussion {
  const notes = discussion.notes.map(normalizeNote)
  const resolvableNotes = notes.filter(note => note.resolvable)
  return {
    id: discussion.id,
    individualNote: discussion.individual_note,
    resolvable: resolvableNotes.length > 0,
    resolved: resolvableNotes.length > 0 && resolvableNotes.every(note => note.resolved),
    notes,
    position: notes[0]?.position ?? null,
  }
}

const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|webp|avif|bmp|ico)$/i
const LFS_POINTER = /^[ +-]?version https:\/\/git-lfs\.github\.com\/spec\/v1$/m

export function isLfsPointerDiff(diff: string) {
  return LFS_POINTER.test(diff)
}

function normalizeDiff(raw: RawDiff, index: number): DiffFile {
  const isBinary = /^Binary files /.test(raw.diff)
    || isLfsPointerDiff(raw.diff)
    || (!raw.diff && !raw.too_large && !raw.collapsed && IMAGE_EXTENSION.test(raw.new_path))
  const counts = isBinary ? { additions: 0, deletions: 0 } : countChanges(raw.diff)
  const status = raw.new_file ? 'added' : raw.deleted_file ? 'removed' : raw.renamed_file ? 'renamed' : 'modified'
  return {
    id: `${index}:${raw.new_path}`,
    path: raw.new_path,
    previousPath: raw.renamed_file ? raw.old_path : null,
    status,
    diff: isBinary ? '' : raw.diff,
    ...counts,
    isBinary,
    tooLarge: Boolean(raw.too_large || raw.collapsed) && !raw.diff,
    generated: raw.generated_file ?? false,
    aMode: raw.a_mode,
    bMode: raw.b_mode,
  }
}

export interface GitlabClient {
  viewer: () => Promise<User>
  mergeRequest: () => Promise<MergeRequest>
  diffs: () => Promise<DiffFile[]>
  discussions: () => Promise<Discussion[]>
  approvals: () => Promise<Approvals>
  approve: () => Promise<void>
  unapprove: () => Promise<void>
  mergeStatus: () => Promise<MergeStatus>
  merge: (sha: string, autoMerge: boolean) => Promise<void>
  cancelAutoMerge: () => Promise<void>
  rebase: () => Promise<void>
  createDiscussion: (body: string, diffRefs: DiffRefs, comment?: NewDiffComment) => Promise<Discussion>
  reply: (discussionId: string, body: string) => Promise<Note>
  resolve: (discussionId: string, resolved: boolean) => Promise<Discussion>
  editNote: (discussionId: string, noteId: number, body: string) => Promise<Note>
  deleteNote: (discussionId: string, noteId: number) => Promise<void>
  fileContents: (diffRefs: DiffRefs, oldPath: string | null, newPath: string | null) => Promise<FileContentsPair>
  blob: (path: string, sha: string) => Promise<Response | null>
  bundleArtifacts: (settings: Pick<BundleSettings, 'jobName' | 'analysisPath' | 'modulesPath' | 'baseBranch'>) => Promise<BundleArtifacts>
}

interface RawJob {
  id: number
  name: string
  status: string
  web_url: string
  finished_at: string | null
  artifacts?: { file_type: string }[]
}

interface RawPipeline {
  id: number
  sha: string
  ref: string
}

interface RawPipelineJob {
  id: number
  name: string
  stage: string
  status: string
  web_url: string
  allow_failure: boolean
}

const PIPELINES_TO_SCAN = 20

async function sha1Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function lineType(position: DiffLinePosition) {
  if (position.oldLine === null)
    return 'new'
  if (position.newLine === null)
    return 'old'
  return null
}

async function buildLineRange(oldPath: string, newPath: string, range: { start: DiffLinePosition, end: DiffLinePosition }) {
  const pathHash = await sha1Hex(newPath || oldPath)
  const point = (position: DiffLinePosition) => ({
    line_code: `${pathHash}_${position.oldLine ?? 0}_${position.newLine ?? 0}`,
    type: lineType(position),
    old_line: position.oldLine,
    new_line: position.newLine,
  })
  return { start: point(range.start), end: point(range.end) }
}

export function createRequester(host: string, token: string) {
  const apiBase = `https://${host}/api/v4`

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
    if (!response.ok) {
      let message = response.statusText
      try {
        const data = await response.json() as { message?: unknown, error?: unknown }
        message = typeof data.message === 'string' ? data.message : JSON.stringify(data.message ?? data.error ?? data)
      }
      catch {}
      throw new GitlabError(response.status, `GitLab ${response.status}: ${message}`)
    }
    return response
  }

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await request(path, init)
    return response.json() as Promise<T>
  }

  async function paginate<T>(path: string): Promise<T[]> {
    const items: T[] = []
    let page: string | null = '1'
    while (page) {
      const separator = path.includes('?') ? '&' : '?'
      const response = await request(`${path}${separator}per_page=100&page=${page}`)
      items.push(...await response.json() as T[])
      page = response.headers.get('x-next-page') || null
    }
    return items
  }

  async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(`https://${host}/api/graphql`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (!response.ok)
      throw new GitlabError(response.status, `GitLab ${response.status}: ${response.statusText}`)
    const result = await response.json() as { data?: T, errors?: { message: string }[] }
    if (result.errors?.length || !result.data)
      throw new GitlabError(response.status, `GitLab GraphQL: ${result.errors?.map(error => error.message).join(', ') ?? 'no data'}`)
    return result.data
  }

  return { request, json, paginate, graphql }
}

export function createGitlabClient(ref: MrRef, token: string): GitlabClient {
  const mrPath = `/projects/${encodeURIComponent(ref.project)}/merge_requests/${ref.iid}`

  const { request, json, paginate } = createRequester(ref.host, token)

  async function rawFile(path: string, sha: string): Promise<string | null> {
    try {
      const response = await request(`/projects/${encodeURIComponent(ref.project)}/repository/files/${encodeURIComponent(path)}/raw?ref=${sha}`)
      return await response.text()
    }
    catch (error) {
      if (error instanceof GitlabError && error.status === 404)
        return null
      throw error
    }
  }

  return {
    async viewer() {
      return normalizeUser(await json<RawUser>('/user'))
    },

    async mergeRequest() {
      const raw = await json<{
        title: string
        description: string | null
        state: MergeRequest['state']
        draft: boolean
        web_url: string
        author: RawUser
        source_branch: string
        target_branch: string
        created_at: string
        updated_at: string
        diff_refs: { base_sha: string, head_sha: string, start_sha: string } | null
        labels: string[]
        reviewers?: RawUser[]
      }>(mrPath)
      if (!raw.diff_refs)
        throw new GitlabError(409, 'This merge request has no diff yet.')
      return {
        ref,
        title: raw.title,
        description: raw.description ?? '',
        state: raw.state,
        draft: raw.draft,
        webUrl: raw.web_url,
        author: normalizeUser(raw.author),
        sourceBranch: raw.source_branch,
        targetBranch: raw.target_branch,
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
        diffRefs: {
          baseSha: raw.diff_refs.base_sha,
          headSha: raw.diff_refs.head_sha,
          startSha: raw.diff_refs.start_sha,
        },
        labels: raw.labels,
        reviewers: (raw.reviewers ?? []).map(normalizeUser),
      }
    },

    async diffs() {
      try {
        const raw = await paginate<RawDiff>(`${mrPath}/diffs`)
        return raw.map(normalizeDiff)
      }
      catch (error) {
        if (!(error instanceof GitlabError) || error.status !== 404)
          throw error
        const legacy = await json<{ changes: RawDiff[] }>(`${mrPath}/changes?access_raw_diffs=true`)
        return legacy.changes.map(normalizeDiff)
      }
    },

    async discussions() {
      const raw = await paginate<RawDiscussion>(`${mrPath}/discussions`)
      return raw
        .map(normalizeDiscussion)
        .filter(discussion => discussion.notes.some(note => !note.system))
    },

    async approvals() {
      const raw = await json<{
        approved: boolean
        approvals_required: number
        approvals_left: number
        approved_by: { user: RawUser }[]
        user_has_approved: boolean
        user_can_approve: boolean
      }>(`${mrPath}/approvals`)
      return {
        approved: raw.approved,
        approvalsRequired: raw.approvals_required,
        approvalsLeft: raw.approvals_left,
        approvedBy: raw.approved_by.map(entry => normalizeUser(entry.user)),
        userHasApproved: raw.user_has_approved,
        userCanApprove: raw.user_can_approve,
      }
    },

    async approve() {
      await request(`${mrPath}/approve`, { method: 'POST' })
    },

    async unapprove() {
      await request(`${mrPath}/unapprove`, { method: 'POST' })
    },

    async mergeStatus() {
      const raw = await json<{
        state: MergeStatus['state']
        draft: boolean
        detailed_merge_status: string
        has_conflicts: boolean
        sha: string
        target_branch: string
        merge_when_pipeline_succeeds: boolean
        merge_error: string | null
        rebase_in_progress?: boolean
        user?: { can_merge: boolean }
        head_pipeline: { id: number, status: string, web_url: string } | null
      }>(`${mrPath}?with_merge_status_recheck=true&include_rebase_in_progress=true`)
      const project = await json<{ merge_method?: MergeMethod }>(`/projects/${encodeURIComponent(ref.project)}`)
      const jobs = raw.head_pipeline
        ? await paginate<RawPipelineJob>(`/projects/${encodeURIComponent(ref.project)}/pipelines/${raw.head_pipeline.id}/jobs`)
        : []
      return {
        state: raw.state,
        draft: raw.draft,
        detailedStatus: raw.detailed_merge_status,
        hasConflicts: raw.has_conflicts,
        headSha: raw.sha,
        targetBranch: raw.target_branch,
        autoMerge: raw.merge_when_pipeline_succeeds,
        canMerge: raw.user?.can_merge ?? false,
        mergeError: raw.merge_error,
        mergeMethod: project.merge_method ?? 'merge',
        rebaseInProgress: raw.rebase_in_progress ?? false,
        pipeline: raw.head_pipeline && {
          id: raw.head_pipeline.id,
          status: raw.head_pipeline.status,
          webUrl: raw.head_pipeline.web_url,
          jobs: jobs.map(job => ({
            id: job.id,
            name: job.name,
            stage: job.stage,
            status: job.status,
            webUrl: job.web_url,
            allowFailure: job.allow_failure,
          })),
        },
      }
    },

    async merge(sha, autoMerge) {
      // GitLab before 17.11 only knows merge_when_pipeline_succeeds, newer versions prefer auto_merge.
      const body = autoMerge ? { sha, auto_merge: true, merge_when_pipeline_succeeds: true } : { sha }
      await request(`${mrPath}/merge`, { method: 'PUT', body: JSON.stringify(body) })
    },

    async cancelAutoMerge() {
      await request(`${mrPath}/cancel_merge_when_pipeline_succeeds`, { method: 'POST' })
    },

    async rebase() {
      await request(`${mrPath}/rebase`, { method: 'PUT' })
    },

    async createDiscussion(body, diffRefs, comment) {
      const post = async (lineRange: unknown) => {
        const payload = comment
          ? {
              body,
              position: {
                position_type: 'text',
                base_sha: diffRefs.baseSha,
                start_sha: diffRefs.startSha,
                head_sha: diffRefs.headSha,
                old_path: comment.oldPath,
                new_path: comment.newPath,
                ...(comment.oldLine !== null ? { old_line: comment.oldLine } : {}),
                ...(comment.newLine !== null ? { new_line: comment.newLine } : {}),
                ...(lineRange ? { line_range: lineRange } : {}),
              },
            }
          : { body }
        return normalizeDiscussion(await json<RawDiscussion>(`${mrPath}/discussions`, { method: 'POST', body: JSON.stringify(payload) }))
      }
      const lineRange = comment?.range ? await buildLineRange(comment.oldPath, comment.newPath, comment.range).catch(() => null) : null
      if (!lineRange)
        return post(null)
      try {
        return await post(lineRange)
      }
      catch (error) {
        if (error instanceof GitlabError && error.status === 400)
          return post(null)
        throw error
      }
    },

    async reply(discussionId, body) {
      const raw = await json<RawNote>(`${mrPath}/discussions/${discussionId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      })
      return normalizeNote(raw)
    },

    async resolve(discussionId, resolved) {
      const raw = await json<RawDiscussion>(`${mrPath}/discussions/${discussionId}?resolved=${resolved}`, { method: 'PUT' })
      return normalizeDiscussion(raw)
    },

    async editNote(discussionId, noteId, body) {
      const raw = await json<RawNote>(`${mrPath}/discussions/${discussionId}/notes/${noteId}`, {
        method: 'PUT',
        body: JSON.stringify({ body }),
      })
      return normalizeNote(raw)
    },

    async deleteNote(discussionId, noteId) {
      await request(`${mrPath}/discussions/${discussionId}/notes/${noteId}`, { method: 'DELETE' })
    },

    async blob(path, sha) {
      try {
        return await request(`/projects/${encodeURIComponent(ref.project)}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(sha)}&lfs=true`, { headers: { Accept: '*/*' } })
      }
      catch (error) {
        if (error instanceof GitlabError && error.status === 404)
          return null
        throw error
      }
    },

    async bundleArtifacts(settings) {
      const projectPath = `/projects/${encodeURIComponent(ref.project)}`
      const mr = await json<{ diff_refs: { base_sha: string, head_sha: string } | null }>(mrPath)
      const headSha = mr.diff_refs?.head_sha ?? ''
      const baseSha = mr.diff_refs?.base_sha ?? null

      async function jobsOf(pipeline: RawPipeline) {
        try {
          return await json<RawJob[]>(`${projectPath}/pipelines/${pipeline.id}/jobs?per_page=100`)
        }
        catch {
          return []
        }
      }

      async function artifact(jobId: number, path: string): Promise<unknown | null> {
        if (!path.trim())
          return null
        try {
          const response = await request(`${projectPath}/jobs/${jobId}/artifacts/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: { Accept: '*/*' } })
          const text = await response.text()
          return text.trim() ? JSON.parse(text) : null
        }
        catch {
          return null
        }
      }

      async function sideFrom(pipeline: RawPipeline, job: RawJob): Promise<BundleArtifactSide | null> {
        const [analysis, modules] = await Promise.all([artifact(job.id, settings.analysisPath), artifact(job.id, settings.modulesPath)])
        if (!analysis)
          return null
        return { jobId: job.id, jobUrl: job.web_url, pipelineId: pipeline.id, sha: pipeline.sha, ref: pipeline.ref, finishedAt: job.finished_at, analysis, modules: trimAnalyzerNodes(modules) }
      }

      async function isAncestorOfBase(sha: string) {
        if (!baseSha || sha === baseSha)
          return true
        try {
          const mergeBase = await json<{ id: string }>(`${projectPath}/repository/merge_base?refs[]=${sha}&refs[]=${baseSha}`)
          return mergeBase.id === sha
        }
        catch {
          return false
        }
      }

      const hasArchive = (job: RawJob) => job.status === 'success' && (job.artifacts ?? []).some(entry => entry.file_type === 'archive')

      let current: BundleArtifactSide | null = null
      let latestJob: BundleArtifacts['latestJob'] = null
      const mrPipelines = await json<RawPipeline[]>(`${mrPath}/pipelines?per_page=${PIPELINES_TO_SCAN}`).catch(() => [])
      for (const pipeline of mrPipelines) {
        const job = (await jobsOf(pipeline)).find(candidate => candidate.name === settings.jobName)
        if (!job)
          continue
        latestJob ??= { status: job.status, webUrl: job.web_url }
        if (hasArchive(job)) {
          current = await sideFrom(pipeline, job)
          if (current)
            break
        }
      }

      let base: BundleArtifactSide | null = null
      const basePipelines = await json<RawPipeline[]>(`${projectPath}/pipelines?ref=${encodeURIComponent(settings.baseBranch)}&source=push&order_by=id&sort=desc&per_page=${PIPELINES_TO_SCAN}`).catch(() => [])
      for (const pipeline of basePipelines) {
        const job = (await jobsOf(pipeline)).find(candidate => candidate.name === settings.jobName && hasArchive(candidate))
        if (job && await isAncestorOfBase(pipeline.sha)) {
          base = await sideFrom(pipeline, job)
          if (base)
            break
        }
      }

      return { current, base, headSha, latestJob }
    },

    async fileContents(diffRefs, oldPath, newPath) {
      const [oldContents, newContents] = await Promise.all([
        oldPath ? rawFile(oldPath, diffRefs.baseSha) : null,
        newPath ? rawFile(newPath, diffRefs.headSha) : null,
      ])
      return { oldContents, newContents }
    },
  }
}
