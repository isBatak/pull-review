import { describe, expect, it } from 'vitest'
import { buildResolvePrompt, conflictHunks, hasConflictMarkers, parseMergeTreeNames, readResolution, syncSteps, syncStrategy } from './conflicts'

const CONFLICTED = [
  'import a',
  '<<<<<<< HEAD',
  'const x = 1',
  '||||||| base',
  'const x = 0',
  '=======',
  'const x = 2',
  'const y = 3',
  '>>>>>>> develop',
  'export { x }',
].join('\n')

describe('syncStrategy', () => {
  it('rebases unless the project merges with merge commits', () => {
    expect(syncStrategy('ff')).toBe('rebase')
    expect(syncStrategy('rebase_merge')).toBe('rebase')
    expect(syncStrategy('merge')).toBe('merge')
  })
})

describe('conflictHunks', () => {
  it('reads both sides and skips the base section', () => {
    expect(conflictHunks(CONFLICTED)).toEqual([{ line: 2, ours: ['const x = 1'], theirs: ['const x = 2', 'const y = 3'] }])
  })

  it('finds no hunks in a clean file', () => {
    expect(conflictHunks('a\n=======\nb')).toEqual([])
  })
})

describe('hasConflictMarkers', () => {
  it('needs both an opening and a closing marker', () => {
    expect(hasConflictMarkers(CONFLICTED)).toBe(true)
    expect(hasConflictMarkers('heading\n=======\n')).toBe(false)
  })
})

describe('parseMergeTreeNames', () => {
  it('drops the tree id and repeated names', () => {
    expect(parseMergeTreeNames('4b825dc\nsrc/a.ts\nsrc/a.ts\nsrc/b.ts\n')).toEqual(['src/a.ts', 'src/b.ts'])
    expect(parseMergeTreeNames('4b825dc\n')).toEqual([])
  })
})

describe('buildResolvePrompt', () => {
  it('says which side is which for a rebase', () => {
    const prompt = buildResolvePrompt({ title: 'feat: x', target: 'develop', strategy: 'rebase', commitSubject: 'add y', files: [{ path: 'a.ts', content: CONFLICTED }] })
    expect(prompt).toContain('The first side (<<<<<<<) is develop')
    expect(prompt).toContain('"add y"')
    expect(prompt).toContain('File: a.ts')
  })
})

describe('readResolution', () => {
  const output = (files: unknown) => ({ structured_output: { files } })

  it('returns the files in the expected order', () => {
    const result = readResolution(output([
      { path: 'b.ts', content: 'b', explanation: 'kept b' },
      { path: 'a.ts', content: 'a', explanation: 'kept a' },
    ]), ['a.ts', 'b.ts'])
    expect(result).toEqual({ files: [{ path: 'a.ts', content: 'a', explanation: 'kept a' }, { path: 'b.ts', content: 'b', explanation: 'kept b' }] })
  })

  it('rejects missing files and leftover markers', () => {
    expect(readResolution(output([{ path: 'a.ts', content: 'a', explanation: '' }]), ['a.ts', 'b.ts'])).toEqual({ error: 'Claude did not fix b.ts.' })
    expect(readResolution(output([{ path: 'a.ts', content: CONFLICTED, explanation: '' }]), ['a.ts'])).toEqual({ error: 'Claude left conflict markers in a.ts.' })
    expect(readResolution(null, ['a.ts'])).toEqual({ error: 'Claude did not return the fixed files.' })
  })
})

describe('syncSteps', () => {
  const states = (phase: Parameters<typeof syncSteps>[0]['phase'], updated = false, newHead: string | null = null) =>
    syncSteps({ strategy: 'rebase', target: 'develop', phase, newHead }, { reference: '!7', branch: 'feat', updated }).map(step => `${step.id}:${step.state}`)

  it('follows the job from fixing to the updated merge request', () => {
    expect(states('resolve')).toEqual(['fix:active', 'review:pending', 'push:pending', 'update:pending'])
    expect(states('review', false, 'abc')).toEqual(['fix:done', 'review:active', 'push:pending', 'update:pending'])
    expect(states('pushed', false, 'abc')).toEqual(['fix:done', 'review:done', 'push:done', 'update:active'])
    expect(states('pushed', true, 'abc')).toEqual(['fix:done', 'review:done', 'push:done', 'update:done'])
  })

  it('marks where it failed', () => {
    expect(states('failed')).toEqual(['fix:failed', 'review:pending', 'push:pending', 'update:pending'])
  })

  it('names the push the strategy needs', () => {
    const labels = (strategy: 'rebase' | 'merge') => syncSteps({ strategy, target: 'develop', phase: 'apply', newHead: null }, { reference: '!7', branch: 'feat', updated: false })[2]!.label
    expect(labels('rebase')).toBe('Force push to feat, only if nobody else pushed')
    expect(labels('merge')).toBe('Push to feat')
  })
})
