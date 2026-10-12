import type { ListFilters } from './gitlab-list-link'
import { describe, expect, it } from 'vitest'
import { gitlabListLink } from './gitlab-list-link'

const base: ListFilters = {
  projectWebUrl: 'https://gitlab.tradelocker.com/tradelocker/tradelocker',
  state: 'opened',
  authors: [],
  quick: 'all',
  apps: [],
  search: '',
}

function query(url: string) {
  return Object.fromEntries(new URL(url).searchParams)
}

describe('gitlabListLink', () => {
  it('links to the state tab with no other filters', () => {
    const link = gitlabListLink({ ...base, state: 'merged' })
    expect(link.url).toBe('https://gitlab.tradelocker.com/tradelocker/tradelocker/-/merge_requests?state=merged')
    expect(link.missing).toEqual([])
  })

  it('carries one author, reviewer, drafts and search', () => {
    const link = gitlabListLink({ ...base, authors: ['dario.susanj'], quick: 'draft', search: 'react query' })
    expect(query(link.url)).toEqual({ state: 'opened', author_username: 'dario.susanj', draft: 'yes', search: 'react query' })
    expect(gitlabListLink({ ...base, reviewer: 'ivica.batinic' }).url).toContain('reviewer_username=ivica.batinic')
  })

  it('reports filters GitLab cannot express', () => {
    const link = gitlabListLink({ ...base, authors: ['a', 'b'], quick: 'ready', apps: ['WEB', 'APP'] })
    expect(query(link.url)).toEqual({ state: 'opened' })
    expect(link.missing).toEqual(['2 authors at once', 'the Ready to merge filter', 'app tags (WEB, APP)'])
  })

  it('lets the caller pick one author or none from a team', () => {
    const team = { ...base, authors: ['a', 'b', 'c'] }
    expect(query(gitlabListLink(team, 'b').url)).toEqual({ state: 'opened', author_username: 'b' })
    expect(gitlabListLink(team, null).missing).toEqual([])
  })

  it('ignores the quick filter outside the open tab', () => {
    expect(gitlabListLink({ ...base, state: 'closed', quick: 'draft' }).missing).toEqual([])
    expect(query(gitlabListLink({ ...base, state: 'closed', quick: 'draft' }).url)).toEqual({ state: 'closed' })
  })
})
