import type { MrCounts, MrListResponse, MrListState, MrState, MrSummary, ProjectInfo, ProjectRef, User } from '../shared/types'
import type { RawUser } from './gitlab'
import { createRequester, normalizeUser } from './gitlab'

const PAGE_SIZE = 100
const MAX_PARALLEL_REQUESTS = 8

interface RawMrSummary {
  iid: number
  title: string
  draft: boolean
  state: MrState
  web_url: string
  author: RawUser
  reviewers?: RawUser[]
  source_branch: string
  target_branch: string
  created_at: string
  updated_at: string
  merged_at: string | null
  closed_at: string | null
  user_notes_count: number
  detailed_merge_status?: string
  merge_status?: string
  has_conflicts: boolean
  labels: string[]
}

export interface MrListQuery {
  state: MrListState
  limit: number
  authorIds?: number[]
  reviewerId?: number
  search?: string
}

function normalizeMrSummary(raw: RawMrSummary): MrSummary {
  return {
    iid: raw.iid,
    title: raw.title,
    draft: raw.draft,
    state: raw.state,
    webUrl: raw.web_url,
    author: normalizeUser(raw.author),
    reviewers: (raw.reviewers ?? []).map(normalizeUser),
    sourceBranch: raw.source_branch,
    targetBranch: raw.target_branch,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    mergedAt: raw.merged_at,
    closedAt: raw.closed_at,
    userNotesCount: raw.user_notes_count,
    detailedMergeStatus: raw.detailed_merge_status ?? raw.merge_status ?? 'unchecked',
    hasConflicts: raw.has_conflicts,
    labels: raw.labels,
  }
}

async function mapLimited<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let next = 0
  const workers = Array.from({ length: Math.min(MAX_PARALLEL_REQUESTS, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await run(items[index]!)
    }
  })
  await Promise.all(workers)
  return results
}

export function createGitlabProjectClient(ref: ProjectRef, token: string) {
  const { request, json, paginate } = createRequester(ref.host, token)
  const projectPath = `/projects/${encodeURIComponent(ref.project)}`

  function mrQuery(state: MrListState, extra: Record<string, string>) {
    return new URLSearchParams({ state, order_by: 'updated_at', sort: 'desc', ...extra })
  }

  async function listForAuthor(query: MrListQuery, authorId: number | null) {
    const items: MrSummary[] = []
    const pages = Math.ceil(query.limit / PAGE_SIZE)
    let hasMore = false
    for (let page = 1; page <= pages; page++) {
      const params = mrQuery(query.state, {
        per_page: String(Math.min(PAGE_SIZE, query.limit)),
        page: String(page),
        ...(authorId !== null ? { author_id: String(authorId) } : {}),
        ...(query.reviewerId ? { reviewer_id: String(query.reviewerId) } : {}),
        ...(query.search ? { search: query.search, in: 'title' } : {}),
      })
      const response = await request(`${projectPath}/merge_requests?${params}`)
      items.push(...(await response.json() as RawMrSummary[]).map(normalizeMrSummary))
      hasMore = Boolean(response.headers.get('x-next-page'))
      if (!hasMore)
        break
    }
    return { items, hasMore }
  }

  async function countFor(state: MrListState, authorId: number | null): Promise<number | null> {
    const params = mrQuery(state, { per_page: '1', ...(authorId !== null ? { author_id: String(authorId) } : {}) })
    const response = await request(`${projectPath}/merge_requests?${params}`)
    const total = response.headers.get('x-total')
    return total === null ? null : Number(total)
  }

  return {
    async viewer(): Promise<User> {
      return normalizeUser(await json<RawUser>('/user'))
    },

    async project(): Promise<ProjectInfo> {
      const raw = await json<{ id: number, name: string, path_with_namespace: string, default_branch: string, web_url: string, avatar_url: string | null }>(projectPath)
      return {
        ref,
        id: raw.id,
        name: raw.name,
        pathWithNamespace: raw.path_with_namespace,
        defaultBranch: raw.default_branch,
        webUrl: raw.web_url,
        avatarUrl: raw.avatar_url,
      }
    },

    async avatar(): Promise<Response | null> {
      try {
        return await request(`${projectPath}/avatar`, { headers: { Accept: '*/*' } })
      }
      catch {
        return null
      }
    },

    async members(): Promise<User[]> {
      const raw = await paginate<RawUser & { state?: string }>(`${projectPath}/members/all`)
      const unique = new Map<number, User>()
      for (const member of raw) {
        if (member.state === undefined || member.state === 'active')
          unique.set(member.id, normalizeUser(member))
      }
      return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name))
    },

    async mergeRequests(query: MrListQuery): Promise<MrListResponse> {
      if (!query.authorIds?.length)
        return listForAuthor(query, null).then(({ items, hasMore }) => ({ items: items.slice(0, query.limit), hasMore: hasMore || items.length > query.limit }))

      const perAuthor = await mapLimited(query.authorIds, authorId => listForAuthor(query, authorId))
      const merged = perAuthor
        .flatMap(result => result.items)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      return {
        items: merged.slice(0, query.limit),
        hasMore: merged.length > query.limit || perAuthor.some(result => result.hasMore),
      }
    },

    async counts(authorIds?: number[]): Promise<MrCounts> {
      const states: MrListState[] = ['opened', 'merged', 'closed', 'all']
      const authors = authorIds?.length ? authorIds : [null]
      const jobs = states.flatMap(state => authors.map(authorId => ({ state, authorId })))
      const values = await mapLimited(jobs, job => countFor(job.state, job.authorId))
      const counts = {} as MrCounts
      for (const state of states) {
        const forState = values.filter((_, index) => jobs[index]!.state === state)
        counts[state] = forState.some(value => value === null) ? null : forState.reduce<number>((sum, value) => sum + value!, 0)
      }
      return counts
    },
  }
}
