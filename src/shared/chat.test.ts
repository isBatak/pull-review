import { describe, expect, it } from 'vitest'
import { buildPrompt, describeRange } from './chat'

describe('buildPrompt', () => {
  it('adds selected code in a fence that cannot be closed by the code', () => {
    const prompt = buildPrompt('Why?', [{ path: 'a.md', side: 'additions', startLine: 3, endLine: 4, code: 'x\n```\ny' }])
    expect(prompt).toBe('Why?\n\nSelected code: a.md, lines 3-4 (new version)\n````\nx\n```\ny\n````')
  })

  it('mentions whole files without code', () => {
    expect(buildPrompt('Explain', [{ path: 'b.ts', side: 'additions', startLine: null, endLine: null, code: null }])).toBe('Explain\n\nSelected file: b.ts')
  })
})

describe('describeRange', () => {
  it('describes single lines, ranges and whole files', () => {
    expect(describeRange({ startLine: 5, endLine: 5 })).toBe('line 5')
    expect(describeRange({ startLine: 5, endLine: 9 })).toBe('lines 5-9')
    expect(describeRange({ startLine: null, endLine: null })).toBe('whole file')
  })
})
