import type { MrListState } from '../../shared/types'
import type { QuickFilter } from './mr-display'

export interface ListFilters {
  projectWebUrl: string
  state: MrListState
  authors: string[]
  reviewer?: string
  quick: QuickFilter
  apps: string[]
  search: string
}

export interface GitlabListLink {
  url: string
  applied: string[]
  missing: string[]
}

const STATE_LABEL: Record<MrListState, string> = { opened: 'open', merged: 'merged', closed: 'closed', all: 'all states' }
const QUICK_LABEL: Record<QuickFilter, string> = { all: '', review: 'In review', ready: 'Ready to merge', attention: 'Needs attention', draft: 'Drafts' }

export function gitlabListLink(filters: ListFilters, author?: string | null): GitlabListLink {
  const params = new URLSearchParams({ state: filters.state })
  const applied = [STATE_LABEL[filters.state]]
  const missing: string[] = []

  const authors = author === undefined ? filters.authors : author === null ? [] : [author]
  if (authors.length === 1) {
    params.set('author_username', authors[0]!)
    applied.push(`author ${authors[0]}`)
  }
  else if (authors.length > 1) {
    missing.push(`${authors.length} authors at once`)
  }

  if (filters.reviewer) {
    params.set('reviewer_username', filters.reviewer)
    applied.push(`reviewer ${filters.reviewer}`)
  }

  if (filters.state === 'opened' && filters.quick !== 'all') {
    if (filters.quick === 'draft') {
      params.set('draft', 'yes')
      applied.push('drafts')
    }
    else {
      missing.push(`the ${QUICK_LABEL[filters.quick]} filter`)
    }
  }

  if (filters.apps.length)
    missing.push(`app tags (${filters.apps.join(', ')})`)

  const search = filters.search.trim()
  if (search) {
    params.set('search', search)
    applied.push(`search "${search}"`)
  }

  return { url: `${filters.projectWebUrl.replace(/\/+$/, '')}/-/merge_requests?${params}`, applied, missing }
}
