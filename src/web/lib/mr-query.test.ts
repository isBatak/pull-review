import type { MrApproval, MrSummary, User } from '../../shared/types'
import { describe, expect, it } from 'vitest'
import { matchesMrQuery, needsApprovals, parseMrQuery, searchText, withoutApprovalFilters } from './mr-query'

function user(username: string): User {
  return { id: username.length, username, name: username, avatarUrl: null, webUrl: '' }
}

function mr(overrides: Partial<MrSummary> = {}): MrSummary {
  return {
    iid: 1,
    title: '[WEB] feat: alerts [EN-1]',
    draft: false,
    state: 'opened',
    webUrl: '',
    author: user('ana'),
    reviewers: [user('ivica.batinic')],
    sourceBranch: 'feature/alerts',
    targetBranch: 'develop',
    createdAt: '',
    updatedAt: '',
    mergedAt: null,
    closedAt: null,
    userNotesCount: 0,
    detailedMergeStatus: 'not_approved',
    hasConflicts: false,
    labels: ['Frontend'],
    ...overrides,
  }
}

const viewer = user('ivica.batinic')

function approvals(...entries: [number, string[], boolean?][]) {
  return new Map<number, MrApproval>(entries.map(([iid, usernames, approved]) => [iid, { iid, approved: approved ?? false, approvedBy: usernames.map(user) }]))
}

describe('parseMrQuery', () => {
  it('splits qualifiers from free text', () => {
    expect(parseMrQuery('-approved-by:@me author:ana,@Bo alerts "two words"')).toEqual({
      filters: [
        { qualifier: 'approved-by', values: ['@me'], negated: true },
        { qualifier: 'author', values: ['ana', 'bo'], negated: false },
      ],
      text: [{ value: 'alerts', negated: false }, { value: 'two words', negated: false }],
    })
  })

  it('treats unknown keys like fix: as text and skips empty qualifiers', () => {
    expect(parseMrQuery('fix: author: -draft')).toEqual({
      filters: [],
      text: [{ value: 'fix:', negated: false }, { value: 'draft', negated: true }],
    })
  })

  it('accepts aliases and quoted values', () => {
    expect(parseMrQuery('approver:"ana"').filters).toEqual([{ qualifier: 'approved-by', values: ['ana'], negated: false }])
  })
})

describe('matchesMrQuery', () => {
  it('finds merge requests the viewer has not approved', () => {
    const query = parseMrQuery('-approved-by:@me')
    const context = { viewer, approvals: approvals([1, ['ivica.batinic']], [2, ['ana']]) }
    expect(matchesMrQuery(mr({ iid: 1 }), query, context)).toBe(false)
    expect(matchesMrQuery(mr({ iid: 2 }), query, context)).toBe(true)
    expect(matchesMrQuery(mr({ iid: 3 }), query, context)).toBe(true)
  })

  it('matches people, apps, labels and branches', () => {
    const context = { viewer }
    expect(matchesMrQuery(mr(), parseMrQuery('reviewer:@me author:ana app:web label:frontend branch:alerts target:develop'), context)).toBe(true)
    expect(matchesMrQuery(mr(), parseMrQuery('author:bo,ana'), context)).toBe(true)
    expect(matchesMrQuery(mr(), parseMrQuery('-author:ana'), context)).toBe(false)
    expect(matchesMrQuery(mr(), parseMrQuery('app:office'), context)).toBe(false)
  })

  it('handles is: and has: states', () => {
    const context = { viewer, approvals: approvals([1, ['ana'], true]) }
    expect(matchesMrQuery(mr({ draft: true }), parseMrQuery('is:draft'), context)).toBe(true)
    expect(matchesMrQuery(mr(), parseMrQuery('is:approved'), context)).toBe(true)
    expect(matchesMrQuery(mr({ iid: 2 }), parseMrQuery('-is:approved'), context)).toBe(true)
    expect(matchesMrQuery(mr({ hasConflicts: true }), parseMrQuery('has:conflicts'), context)).toBe(true)
    expect(matchesMrQuery(mr({ reviewers: [] }), parseMrQuery('-has:reviewer'), context)).toBe(true)
    expect(matchesMrQuery(mr(), parseMrQuery('is:unknown'), context)).toBe(true)
  })

  it('matches free text against title, iid, author and branch', () => {
    expect(matchesMrQuery(mr(), parseMrQuery('alerts !1'), {})).toBe(true)
    expect(matchesMrQuery(mr(), parseMrQuery('-alerts'), {})).toBe(false)
  })
})

describe('query helpers', () => {
  it('knows when approvals are needed and what text to send to GitLab', () => {
    const query = parseMrQuery('-approved-by:@me is:approved author:ana alerts -wip')
    expect(needsApprovals(query)).toBe(true)
    expect(needsApprovals(withoutApprovalFilters(query))).toBe(false)
    expect(searchText(query)).toBe('alerts')
  })
})
