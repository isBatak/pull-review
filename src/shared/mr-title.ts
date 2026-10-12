export interface AppTag {
  name: string
  qualifier: string | null
}

export interface ParsedMrTitle {
  text: string
  draft: boolean
  apps: AppTag[]
  jiraKeys: string[]
  stackedLevel: number | null
}

const DRAFT_PREFIX = /^\s*(?:draft:|\[draft\]|\(draft\)|wip:)\s*/i
const LEADING_TAG = /^\s*\[([^\]]+)\]/
const JIRA_TAG = /\[([A-Z][A-Z0-9]+-\d+)\]/g
const STACKED_TAG = /\[stacked-(\d+)\]/gi
const PLACEHOLDER_JIRA = /-0+$/

export function parseMrTitle(title: string): ParsedMrTitle {
  let rest = title
  let draft = false
  if (DRAFT_PREFIX.test(rest)) {
    draft = true
    rest = rest.replace(DRAFT_PREFIX, '')
  }

  const apps: AppTag[] = []
  let match = LEADING_TAG.exec(rest)
  while (match && !/^[A-Z][A-Z0-9]+-\d+$/.test(match[1]!.trim()) && !/^stacked-\d+$/i.test(match[1]!.trim())) {
    const [name = '', ...qualifier] = match[1]!.trim().split(/\s+/)
    apps.push({ name: name.toUpperCase(), qualifier: qualifier.length ? qualifier.join(' ') : null })
    rest = rest.slice(match[0].length)
    match = LEADING_TAG.exec(rest)
  }

  const jiraKeys = [...rest.matchAll(JIRA_TAG)]
    .map(found => found[1]!)
    .filter(key => !PLACEHOLDER_JIRA.test(key))
  const stackedMatches = [...rest.matchAll(STACKED_TAG)]
  const stackedLevel = stackedMatches.length ? Number(stackedMatches.at(-1)![1]) : null

  const text = rest
    .replace(JIRA_TAG, '')
    .replace(STACKED_TAG, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return { text, draft, apps, jiraKeys: [...new Set(jiraKeys)], stackedLevel }
}

export function jiraUrl(baseUrl: string, key: string) {
  return `${baseUrl.replace(/\/+$/, '')}/browse/${key}`
}
