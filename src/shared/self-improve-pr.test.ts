import { describe, expect, it } from 'vitest'
import { issueUrl, prBody, prBranch, prTitle, readPrNumber } from './self-improve-pr'

const change = { id: 'a1b2c3d4-0000', request: 'Remove the gap under the badge\n\nIt looks off.', summary: 'The badge has no bottom margin now.', version: '1.2.3' }

describe('pull requests for local changes', () => {
  it('names the branch and the title after the request', () => {
    expect(prBranch(change)).toBe('self-improve/a1b2c3d4')
    expect(prTitle(change)).toBe('Remove the gap under the badge')
    expect(prTitle({ request: 'x'.repeat(100) })).toHaveLength(72)
  })

  it('writes a body with the request, the summary and a note', () => {
    expect(prBody(change, 'Depends on #4.')).toBe('Remove the gap under the badge\n\nIt looks off.\n\n**What changed:** The badge has no bottom margin now.\n\nDepends on #4.\n\nMade with Claude Code from the Feedback page of Pull Review 1.2.3.')
    expect(prBody({ ...change, summary: null }, null)).not.toContain('What changed')
  })

  it('prefills an issue with the patch, cut when it is long', () => {
    const url = new URL(issueUrl(change, '+a'.repeat(4000)))
    expect(url.origin + url.pathname).toBe('https://github.com/isBatak/pull-review/issues/new')
    expect(url.searchParams.get('title')).toBe('Remove the gap under the badge')
    expect(url.searchParams.get('body')).toMatch(/```diff\n(\+a)+\n… \(cut, 3000 more characters\)\n```$/)
  })

  it('reads the number from a pull request link', () => {
    expect(readPrNumber('https://github.com/isBatak/pull-review/pull/42\n')).toBe(42)
    expect(readPrNumber('nope')).toBeNull()
  })
})
