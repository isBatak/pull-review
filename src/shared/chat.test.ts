import type { Discussion } from './types'
import { describe, expect, it } from 'vitest'
import { buildContextUpdateNote, buildDiscussionsSummary, buildPrompt, contextsForReply, describeRange, discussionsInContexts, fixedContexts, isPatch, repairDiffFences, toChatThread } from './chat'

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

describe('discussionsInContexts', () => {
  it('finds attached threads by id, and by file, line and text for chats saved without ids', () => {
    const thread = toChatThread(discussion())!
    const { discussionId: _id, ...withoutId } = thread
    const context = (threads: typeof thread[]) => ({ path: 'a.md', side: 'additions' as const, startLine: 10, endLine: 12, code: 'x', threads })
    expect(discussionsInContexts([context([thread])], [])).toEqual(['d1'])
    expect(discussionsInContexts([context([withoutId])], [discussion()])).toEqual(['d1'])
    expect(discussionsInContexts([context([{ ...withoutId, line: 13 }])], [discussion()])).toEqual([])
  })
})

describe('contextsForReply', () => {
  const context = (path: string) => ({ path, side: 'additions' as const, startLine: 1, endLine: 1, code: null, threads: [] })
  const user = (contexts: ReturnType<typeof context>[]) => ({ role: 'user' as const, contexts })
  const assistant = { role: 'assistant' as const, contexts: [] }

  it('uses what was attached to the question', () => {
    expect(contextsForReply([user([context('a.md')]), assistant], 1)).toEqual({ contexts: [context('a.md')], inherited: false })
  })

  it('carries attachments over to follow-ups that attach nothing', () => {
    const messages = [user([context('a.md')]), assistant, user([]), assistant]
    expect(contextsForReply(messages, 3)).toEqual({ contexts: [context('a.md')], inherited: true })
  })

  it('counts carried-over attachments only for files the patch changed', () => {
    const reply = { contexts: [context('a.md'), context('b.md')], inherited: true }
    expect(fixedContexts(reply, ['b.md'])).toEqual([context('b.md')])
    expect(fixedContexts({ ...reply, inherited: false }, ['b.md'])).toHaveLength(2)
  })
})

describe('repairDiffFences', () => {
  it('widens a diff fence when an unchanged line inside it is a fence', () => {
    const text = ['Fix:', '```diff', '--- a/SKILL.md', '+++ b/SKILL.md', '@@ -1,3 +1,3 @@', ' ```', '-old', '+new', '```', 'Done.'].join('\n')
    expect(repairDiffFences(text)).toBe(['Fix:', '````diff', '--- a/SKILL.md', '+++ b/SKILL.md', '@@ -1,3 +1,3 @@', ' ```', '-old', '+new', '````', 'Done.'].join('\n'))
  })

  it('leaves normal blocks and unfinished streams alone', () => {
    const normal = ['```diff', '-a', '+b', '```', '```ts', 'x', '```'].join('\n')
    expect(repairDiffFences(normal)).toBe(normal)
    expect(repairDiffFences('```diff\n-a')).toBe('```diff\n-a')
  })
})
