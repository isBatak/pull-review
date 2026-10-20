import { describe, expect, it } from 'vitest'
import { buildMrDraftPrompt, parseBranchLog, readMrDraft } from './new-mr'

describe('buildMrDraftPrompt', () => {
  it('lists the titles to copy, the commits and the files', () => {
    const prompt = buildMrDraftPrompt({
      branch: 'EN-6200-scanner-filters',
      target: 'develop',
      recentTitles: ['[APP minor] feat: market scanner [EN-6180]'],
      commits: [{ subject: 'feat: add filters', body: 'Adds the first filters.' }, { subject: 'test: cover filters', body: '' }],
      diffStat: ' src/filters.ts | 20 +++\n 1 file changed',
    })
    expect(prompt).toContain('Branch: EN-6200-scanner-filters')
    expect(prompt).toContain('- [APP minor] feat: market scanner [EN-6180]')
    expect(prompt).toContain('- feat: add filters\n  Adds the first filters.\n- test: cover filters')
    expect(prompt).toContain('src/filters.ts | 20 +++')
  })
})

describe('readMrDraft', () => {
  it('reads the structured title and description', () => {
    expect(readMrDraft({ structured_output: { title: ' feat: x ', description: ' - y ' } })).toEqual({ title: 'feat: x', description: '- y' })
  })

  it('rejects a missing title', () => {
    expect(readMrDraft({ structured_output: { title: '  ', description: '' } })).toBeNull()
    expect(readMrDraft(null)).toBeNull()
  })
})

describe('parseBranchLog', () => {
  it('splits commits and keeps multi-line bodies', () => {
    const log = 'aaa\u001Ffeat: one\u001Fline 1\nline 2\n\u001E\nbbb\u001Ffix: two\u001F\u001E\n'
    expect(parseBranchLog(log)).toEqual([
      { sha: 'aaa', subject: 'feat: one', body: 'line 1\nline 2' },
      { sha: 'bbb', subject: 'fix: two', body: '' },
    ])
  })
})
