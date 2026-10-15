import type { Discussion } from './types'
import { describe, expect, it } from 'vitest'
import { buildContextUpdateNote, buildDiscussionsSummary, buildPrompt, describeRange, isPatch, toChatThread } from './chat'

const author = { id: 1, username: 'blaz', name: 'Blaž Bagić', avatarUrl: null, webUrl: '' }

function discussion(overrides: Partial<Discussion> = {}): Discussion {
  const position = { oldPath: 'a.md', newPath: 'a.md', oldLine: null, newLine: 12, headSha: 'abc', side: 'additions' as const, line: 12 }
  return {
    id: 'd1',
    individualNote: false,
    resolvable: true,
    resolved: false,
    position,
    notes: [
      { id: 1, body: 'Point to the script.\n\nOne source.', author, createdAt: '2026-10-12T10:00:00Z', updatedAt: '2026-10-12T10:00:00Z', system: false, resolvable: true, resolved: false, resolvedBy: null, position },
      { id: 2, body: 'changed the description', author, createdAt: '2026-10-12T11:00:00Z', updatedAt: '2026-10-12T11:00:00Z', system: true, resolvable: false, resolved: false, resolvedBy: null, position },
    ],
    ...overrides,
  }
}

describe('buildPrompt', () => {
  it('adds selected code in a fence that cannot be closed by the code', () => {
    const prompt = buildPrompt('Why?', [{ path: 'a.md', side: 'additions', startLine: 3, endLine: 4, code: 'x\n```\ny', threads: [] }])
    expect(prompt).toBe('Why?\n\nSelected code: a.md, lines 3-4 (new version)\n````\nx\n```\ny\n````')
  })

  it('mentions whole files without code', () => {
    expect(buildPrompt('Explain', [{ path: 'b.ts', side: 'additions', startLine: null, endLine: null, code: null, threads: [] }])).toBe('Explain\n\nSelected file: b.ts')
  })

  it('adds review threads on the selected lines with commenter and quoted comment', () => {
    const thread = toChatThread(discussion())!
    const prompt = buildPrompt('Fix this', [{ path: 'a.md', side: 'additions', startLine: 12, endLine: 12, code: 'x', threads: [thread] }])
    expect(prompt).toBe([
      'Fix this',
      'Selected code: a.md, line 12 (new version)\n```\nx\n```',
      'Review thread on line 12 (new version), open:\n\nBlaž Bagić (@blaz) wrote on 2026-10-12T10:00:00Z:\n> Point to the script.\n>\n> One source.',
    ].join('\n\n'))
  })
})

describe('toChatThread', () => {
  it('skips system notes and general comments', () => {
    expect(toChatThread(discussion())?.notes).toHaveLength(1)
    expect(toChatThread(discussion({ position: null }))).toBeNull()
  })
})

describe('buildDiscussionsSummary', () => {
  it('lists threads by file and line, and general comments', () => {
    const summary = buildDiscussionsSummary([discussion(), discussion({ id: 'd2', position: null, resolvable: false })])
    expect(summary).toContain('# Review threads (2)')
    expect(summary).toContain('## a.md:12 (new version), open')
    expect(summary).toContain('## General comment\n')
    expect(summary).not.toContain('changed the description')
  })
})

describe('isPatch', () => {
  it('accepts unified diffs in diff blocks only', () => {
    const patch = '--- a/a.md\n+++ b/a.md\n@@ -1 +1 @@\n-x\n+y\n'
    expect(isPatch('diff', patch)).toBe(true)
    expect(isPatch('ts', patch)).toBe(false)
    expect(isPatch('diff', '-x\n+y\n')).toBe(false)
  })
})

describe('describeRange', () => {
  it('describes single lines, ranges and whole files', () => {
    expect(describeRange({ startLine: 5, endLine: 5 })).toBe('line 5')
    expect(describeRange({ startLine: 5, endLine: 9 })).toBe('lines 5-9')
    expect(describeRange({ startLine: null, endLine: null })).toBe('whole file')
  })
})

describe('buildContextUpdateNote', () => {
  it('lists changed context files and says nothing when none changed', () => {
    expect(buildContextUpdateNote([])).toBeNull()
    expect(buildContextUpdateNote(['changes.diff', 'diffs/a.ts.diff'])).toContain('updated: changes.diff, diffs/a.ts.diff.')
    expect(buildContextUpdateNote(Array.from({ length: 12 }, (_, index) => `f${index}`))).toContain('and 2 more')
  })
})
