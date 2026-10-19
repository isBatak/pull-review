import type { MrApproval, MrSummary, User } from '../../shared/types'
import { parseMrTitle } from '../../shared/mr-title'
import { matchesQuickFilter } from './mr-display'

export const QUALIFIERS = ['author', 'reviewer', 'approved-by', 'app', 'label', 'branch', 'target', 'is', 'has'] as const
export type Qualifier = typeof QUALIFIERS[number]

const ALIASES: Record<string, Qualifier> = {
  'approver': 'approved-by',
  'approved_by': 'approved-by',
  'source': 'branch',
}

export const IS_VALUES = ['draft', 'approved', 'ready', 'attention', 'review'] as const
export const HAS_VALUES = ['conflicts', 'reviewer'] as const

export interface QueryFilter {
  qualifier: Qualifier
  values: string[]
  negated: boolean
}

export interface TextTerm {
  value: string
  negated: boolean
}

export interface MrQuery {
  filters: QueryFilter[]
  text: TextTerm[]
}

export interface QueryContext {
  viewer?: User
  approvals?: Map<number, MrApproval>
}

const TOKEN = /(?:[^\s"]+|"[^"]*"?)+/g

function toQualifier(key: string): Qualifier | undefined {
  const lower = key.toLowerCase()
  return (QUALIFIERS as readonly string[]).includes(lower) ? lower as Qualifier : ALIASES[lower]
}

function normalizeValue(value: string) {
  const lower = value.trim().toLowerCase()
  return lower !== '@me' && lower.startsWith('@') ? lower.slice(1) : lower
}

export function parseMrQuery(input: string): MrQuery {
  const query: MrQuery = { filters: [], text: [] }
  for (const token of input.match(TOKEN) ?? []) {
    const negated = token.length > 1 && token.startsWith('-')
    const body = negated ? token.slice(1) : token
    const match = /^([\w-]+):(.*)$/.exec(body)
    const qualifier = match && toQualifier(match[1]!)
    if (qualifier) {
      const values = match[2]!.replaceAll('"', '').split(',').map(normalizeValue).filter(Boolean)
      if (values.length)
        query.filters.push({ qualifier, values, negated })
      continue
    }
    const value = body.replaceAll('"', '').toLowerCase()
    if (value)
      query.text.push({ value, negated })
  }
  return query
}

function isApprovalFilter(filter: QueryFilter) {
  return filter.qualifier === 'approved-by' || (filter.qualifier === 'is' && filter.values.includes('approved'))
}

export function needsApprovals(query: MrQuery) {
  return query.filters.some(isApprovalFilter)
}

export function withoutApprovalFilters(query: MrQuery): MrQuery {
  return { ...query, filters: query.filters.filter(filter => !isApprovalFilter(filter)) }
}

export function searchText(query: MrQuery) {
  return query.text.filter(term => !term.negated).map(term => term.value).join(' ')
}

export function formatFilter(filter: QueryFilter) {
  return `${filter.negated ? '-' : ''}${filter.qualifier}:${filter.values.join(',')}`
}

function sameUser(user: User, value: string, context: QueryContext) {
  const username = value === '@me' ? context.viewer?.username : value
  return username !== undefined && user.username.toLowerCase() === username.toLowerCase()
}

function matchesValue(mr: MrSummary, qualifier: Qualifier, value: string, context: QueryContext): boolean | undefined {
  switch (qualifier) {
    case 'author':
      return sameUser(mr.author, value, context)
    case 'reviewer':
      return mr.reviewers.some(user => sameUser(user, value, context))
    case 'approved-by':
      return (context.approvals?.get(mr.iid)?.approvedBy ?? []).some(user => sameUser(user, value, context))
    case 'app':
      return parseMrTitle(mr.title).apps.some(app => app.name.toLowerCase() === value)
    case 'label':
      return mr.labels.some(label => label.toLowerCase() === value)
    case 'branch':
      return mr.sourceBranch.toLowerCase().includes(value)
    case 'target':
      return mr.targetBranch.toLowerCase().includes(value)
    case 'is':
      switch (value) {
        case 'draft':
          return mr.draft
        case 'approved':
          return context.approvals?.get(mr.iid)?.approved ?? false
        case 'ready':
        case 'attention':
        case 'review':
          return matchesQuickFilter(mr, value)
        default:
          return undefined
      }
    case 'has':
      switch (value) {
        case 'conflicts':
          return mr.hasConflicts
        case 'reviewer':
          return mr.reviewers.length > 0
        default:
          return undefined
      }
  }
}

function matchesFilter(mr: MrSummary, filter: QueryFilter, context: QueryContext) {
  const results = filter.values.map(value => matchesValue(mr, filter.qualifier, value, context)).filter(result => result !== undefined)
  if (!results.length)
    return true
  return results.includes(true) !== filter.negated
}

function matchesText(mr: MrSummary, term: TextTerm) {
  const text = `${mr.title} !${mr.iid} ${mr.author.name} ${mr.author.username} ${mr.sourceBranch} ${mr.targetBranch}`.toLowerCase()
  return text.includes(term.value) !== term.negated
}

export function matchesMrQuery(mr: MrSummary, query: MrQuery, context: QueryContext) {
  return query.filters.every(filter => matchesFilter(mr, filter, context)) && query.text.every(term => matchesText(mr, term))
}
