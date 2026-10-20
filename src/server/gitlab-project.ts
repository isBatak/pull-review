import type { MrApproval, MrCounts, MrListResponse, MrListState, MrState, MrSummary, ProjectInfo, ProjectRef, User } from '../shared/types'
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

interface RawGraphqlUser {
  id: string
  username: string
  name: string
  avatarUrl: string | null
  webUrl: string
}

interface RawApprovalsPage {
  project: {
    mergeRequests: {
      pageInfo: { hasNextPage: boolean, endCursor: string | null }
      nodes: { iid: string, approved: boolean, approvedBy: { nodes: RawGraphqlUser[] } }[]
    }
  } | null
}

const OPEN_APPROVALS_QUERY = `
  query OpenApprovals($fullPath: ID!, $after: String) {
    project(fullPath: $fullPath) {
      mergeRequests(state: opened, first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          iid
          approved
          approvedBy { nodes { id username name avatarUrl webUrl } }
        }
      }
    }
  }
`

const MAX_APPROVAL_PAGES = 10

function normalizeGraphqlUser(raw: RawGraphqlUser, host: string): User {
  return {
    id: Number(raw.id.split('/').pop()),
    username: raw.username,
    name: raw.name,
    avatarUrl: raw.avatarUrl?.startsWith('/') ? `https://${host}${raw.avatarUrl}` : raw.avatarUrl,
    webUrl: raw.webUrl,
  }
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
  const { request, json, paginate, graphql } = createRequester(ref.host, token)
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

    async openApprovals(): Promise<MrApproval[]> {
      const approvals: MrApproval[] = []
      let after: string | null = null
      for (let page = 0; page < MAX_APPROVAL_PAGES; page++) {
        const data: RawApprovalsPage = await graphql<RawApprovalsPage>(OPEN_APPROVALS_QUERY, { fullPath: ref.project, after })
        if (!data.project)
          throw new Error(`GitLab project ${ref.project} was not found`)
        const { nodes, pageInfo } = data.project.mergeRequests
        approvals.push(...nodes.map(node => ({ iid: Number(node.iid), approved: node.approved, approvedBy: node.approvedBy.nodes.map(user => normalizeGraphqlUser(user, ref.host)) })))
        if (!pageInfo.hasNextPage)
          break
        after = pageInfo.endCursor
      }
      return approvals
    },

    async mergeRequestForBranch(branch: string): Promise<MrSummary | null> {
      for (const state of ['opened', 'all'] as const) {
        const params = mrQuery(state, { source_branch: branch, per_page: '1' })
        const found = await json<RawMrSummary[]>(`${projectPath}/merge_requests?${params}`)
        if (found[0])
          return normalizeMrSummary(found[0])
      }
      return null
    },

    async openMergeRequestForBranch(branch: string): Promise<number | null> {
      const found = await json<{ iid: number }[]>(`${projectPath}/merge_requests?${mrQuery('opened', { source_branch: branch, per_page: '1' })}`)
      return found[0]?.iid ?? null
    },

    async mergeRequestHeadsForBranch(branch: string): Promise<string[]> {
      const found = await json<{ sha: string }[]>(`${projectPath}/merge_requests?${mrQuery('all', { source_branch: branch, per_page: '20' })}`)
      return found.map(item => item.sha)
    },

    async recentTitles(): Promise<string[]> {
      const found = await json<{ title: string }[]>(`${projectPath}/merge_requests?${mrQuery('merged', { per_page: '20' })}`)
      return found.map(item => item.title)
    },

    async createMergeRequest(input: { source: string, target: string, title: string, description: string }): Promise<number> {
      const created = await json<{ iid: number }>(`${projectPath}/merge_requests`, {
        method: 'POST',
        body: JSON.stringify({ source_branch: input.source, target_branch: input.target, title: input.title, description: input.description }),
      })
      return created.iid
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
