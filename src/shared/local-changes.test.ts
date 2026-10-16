import { describe, expect, it } from 'vitest'
import { fixFor, hasLocalChanges, parseChangedRanges, readLocalFix, withFix, withoutFix } from './local-changes'

const patch = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -38 +38,3 @@',
  '-old',
  '+new',
  '@@ -60,0 +63,2 @@',
  '+added',
  'diff --git a/src/new.ts b/src/new.ts',
  '--- /dev/null',
  '+++ b/src/new.ts',
  '@@ -0,0 +1 @@',
  '+x',
].join('\n')

describe('parseChangedRanges', () => {
  it('collects changed lines of the base version per file', () => {
    expect(parseChangedRanges(patch)).toEqual({ 'src/a.ts': [[38, 38], [60, 61]] })
  })
})

describe('hasLocalChanges', () => {
  it('tells whether any of the files still has local changes', () => {
    const ranges = parseChangedRanges(patch)
    expect(hasLocalChanges(ranges, ['src/b.ts', 'src/a.ts'])).toBe(true)
    expect(hasLocalChanges(ranges, ['src/b.ts'])).toBe(false)
    expect(hasLocalChanges(null, ['src/a.ts'])).toBe(false)
  })
})

describe('local fixes', () => {
  const fix = (discussionIds: string[], findingIds: string[] = []) => ({ discussionIds, findingIds, paths: ['a.ts'], appliedAt: 1 })

  it('finds the latest fix for a thread or a finding', () => {
    const fixes = [fix(['d1']), fix([], ['f1']), fix(['d1', 'd2'])]
    expect(fixFor(fixes, { discussionId: 'd1' })).toBe(fixes[2])
    expect(fixFor(fixes, { findingId: 'f1' })).toBe(fixes[1])
    expect(fixFor(fixes, { discussionId: 'd9' })).toBeNull()
  })

  it('removes one thread from every fix and drops fixes left empty', () => {
    expect(withoutFix([fix(['d1']), fix(['d1', 'd2'])], { discussionId: 'd1' })).toEqual([fix(['d2'])])
  })

  it('ignores fixes without threads or findings and keeps the newest ones', () => {
    expect(withFix([], fix([]))).toEqual([])
    const many = Array.from({ length: 60 }, (_, index) => fix([`d${index}`]))
    expect(many.reduce(withFix, [] as ReturnType<typeof fix>[]).at(0)!.discussionIds).toEqual(['d10'])
  })

  it('reads stored fixes defensively', () => {
    expect(readLocalFix({ discussionIds: ['d1', 3], paths: 'x', manual: true })).toMatchObject({ discussionIds: ['d1'], findingIds: [], paths: [], manual: true })
    expect(readLocalFix({ discussionIds: [] })).toBeNull()
    expect(readLocalFix('nope')).toBeNull()
  })
})
