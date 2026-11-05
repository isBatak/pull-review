import type { LocalChange } from './self-improve'

export const SELF_IMPROVE_REPO = 'isBatak/pull-review'
export const SELF_IMPROVE_BASE = 'main'

const TITLE_LENGTH = 72
const ISSUE_PATCH_LENGTH = 5000

export function prBranch(change: Pick<LocalChange, 'id'>) {
  return `self-improve/${change.id.slice(0, 8)}`
}

export function prTitle(change: Pick<LocalChange, 'request'>) {
  const firstLine = change.request.split('\n', 1)[0]!.trim()
  return firstLine.length > TITLE_LENGTH ? `${firstLine.slice(0, TITLE_LENGTH - 1)}…` : firstLine
}

export function prBody(change: Pick<LocalChange, 'request' | 'summary' | 'version'>, note: string | null) {
  return [
    change.request,
    change.summary && `**What changed:** ${change.summary}`,
    note,
    `Made with Claude Code from the Feedback page of Pull Review ${change.version}.`,
  ].filter(Boolean).join('\n\n')
}

export function issueUrl(change: Pick<LocalChange, 'request' | 'summary' | 'version'>, patch: string) {
  const shown = patch.length > ISSUE_PATCH_LENGTH ? `${patch.slice(0, ISSUE_PATCH_LENGTH)}\n… (cut, ${patch.length - ISSUE_PATCH_LENGTH} more characters)` : patch
  const body = `${prBody(change, null)}\n\n\`\`\`diff\n${shown}\n\`\`\``
  const params = new URLSearchParams({ title: prTitle(change), body })
  return `https://github.com/${SELF_IMPROVE_REPO}/issues/new?${params}`
}

export function readPrNumber(url: string) {
  const match = /\/pull\/(\d+)\s*$/.exec(url.trim())
  return match ? Number(match[1]) : null
}
