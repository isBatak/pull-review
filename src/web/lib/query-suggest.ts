import type { User } from '../../shared/types'
import type { Qualifier } from './mr-query'
import { HAS_VALUES, IS_VALUES, QUALIFIERS } from './mr-query'

export const QUALIFIER_HELP: Record<Qualifier, string> = {
  'author': 'Written by',
  'reviewer': 'Has this reviewer',
  'approved-by': 'Approved by',
  'app': 'Has this app tag',
  'label': 'Has this label',
  'branch': 'Source branch contains',
  'target': 'Target branch contains',
  'is': 'Draft, approved, ready, attention or review',
  'has': 'Has conflicts or a reviewer',
}

const STATE_HELP: Record<string, string> = {
  draft: 'Draft merge requests',
  approved: 'Has all required approvals',
  ready: 'Ready to merge',
  attention: 'Needs attention',
  review: 'In review',
  conflicts: 'Has merge conflicts',
  reviewer: 'Has at least one reviewer',
}

export interface SuggestionSource {
  viewer?: User
  members: User[]
  apps: string[]
  labels: string[]
  targets: string[]
}

export interface Suggestion {
  kind: 'qualifier' | 'value'
  label: string
  detail?: string
  insert: string
  qualifier: Qualifier
  user?: User
}

export interface SuggestionList {
  from: number
  to: number
  items: Suggestion[]
}

const MAX_SUGGESTIONS = 8
const PEOPLE = new Set<Qualifier>(['author', 'reviewer', 'approved-by'])

function tokenBounds(input: string, cursor: number) {
  let from = cursor
  while (from > 0 && !/\s/.test(input[from - 1]!))
    from--
  let to = cursor
  while (to < input.length && !/\s/.test(input[to]!))
    to++
  return { from, to }
}

function matching(values: string[], partial: string) {
  return [...new Set(values)].filter(value => value.toLowerCase().includes(partial)).sort((a, b) => Number(!a.toLowerCase().startsWith(partial)) - Number(!b.toLowerCase().startsWith(partial)))
}

function valueSuggestions(qualifier: Qualifier, partial: string, source: SuggestionSource): Suggestion[] {
  const value = (label: string, detail?: string, user?: User): Suggestion => ({ kind: 'value', label, detail, insert: label, qualifier, user })
  if (PEOPLE.has(qualifier)) {
    const name = partial.replace(/^@/, '')
    const people = source.members.filter(member => member.username.toLowerCase().includes(name) || member.name.toLowerCase().includes(name))
    const me = '@me'.includes(partial) || (partial.length > 0 && 'me'.startsWith(partial)) ? [value('@me', source.viewer ? `You, ${source.viewer.name}` : 'You', source.viewer)] : []
    return [...me, ...people.map(member => value(member.username, member.name, member))]
  }
  switch (qualifier) {
    case 'is':
      return matching([...IS_VALUES], partial).map(state => value(state, STATE_HELP[state]))
    case 'has':
      return matching([...HAS_VALUES], partial).map(state => value(state, STATE_HELP[state]))
    case 'app':
      return matching(source.apps, partial).map(app => value(app.toLowerCase()))
    case 'label':
      return matching(source.labels, partial).map(label => value(/\s/.test(label) ? `"${label}"` : label))
    case 'target':
      return matching(source.targets, partial).map(target => value(target))
    default:
      return []
  }
}

export function suggest(input: string, cursor: number, source: SuggestionSource): SuggestionList | null {
  const { from, to } = tokenBounds(input, cursor)
  const token = input.slice(from, cursor)
  if (!token)
    return null
  const negation = token.startsWith('-') ? '-' : ''
  const body = token.slice(negation.length)
  const colon = body.indexOf(':')

  if (colon === -1) {
    const partial = body.toLowerCase()
    if (!partial)
      return null
    const items = QUALIFIERS
      .filter(qualifier => qualifier.startsWith(partial))
      .map(qualifier => ({ kind: 'qualifier' as const, label: `${negation}${qualifier}:`, detail: QUALIFIER_HELP[qualifier], insert: `${negation}${qualifier}:`, qualifier }))
    return items.length ? { from, to, items } : null
  }

  const qualifier = QUALIFIERS.find(item => item === body.slice(0, colon).toLowerCase())
  if (!qualifier)
    return null
  const values = body.slice(colon + 1)
  const lastComma = values.lastIndexOf(',')
  const partial = values.slice(lastComma + 1).replaceAll('"', '').replace(/^@(?!m?e?$)/, '').toLowerCase()
  const valueFrom = from + negation.length + colon + 1 + lastComma + 1
  const items = valueSuggestions(qualifier, partial, source).slice(0, MAX_SUGGESTIONS)
  return items.length ? { from: valueFrom, to, items } : null
}

export function applySuggestion(input: string, list: SuggestionList, item: Suggestion) {
  const before = input.slice(0, list.from)
  const after = input.slice(list.to)
  const suffix = item.kind === 'value' && !after.startsWith(' ') ? ' ' : ''
  const value = `${before}${item.insert}${suffix}${after}`
  return { value, cursor: before.length + item.insert.length + suffix.length }
}
