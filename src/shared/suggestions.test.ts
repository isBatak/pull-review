import { describe, expect, it } from 'vitest'
import { parseSuggestionRange, parseUnifiedPatch, patchHasChanges, planSuggestions } from './suggestions'

const HEAD = ['one', 'two', 'three', 'four', 'five', 'six'].join('\n')

function target(shown: number[], headContents: string | null = HEAD) {
  return () => ({ headContents, shows: (line: number) => shown.includes(line) })
}

describe('planSuggestions', () => {
  it('turns a replacement into a suggestion on the first changed line shown in the diff', () => {
    const patch = '--- a/f.md\n+++ b/f.md\n@@ -2,4 +2,3 @@\n two\n-three\n-four\n+THREE AND FOUR\n five\n'
    const plan = planSuggestions(parseUnifiedPatch(patch), target([4, 5]))
    expect(plan.skipped).toEqual([])
    expect(plan.drafts).toEqual([{ path: 'f.md', line: 4, body: '```suggestion:-1+0\nTHREE AND FOUR\n```' }])
  })

  it('finds the hunk by content when the line numbers in the patch are wrong', () => {
    const patch = '--- a/f.md\n+++ b/f.md\n@@ -40,2 +40,2 @@\n five\n-six\n+SIX\n'
    expect(planSuggestions(parseUnifiedPatch(patch), target([6])).drafts).toEqual([{ path: 'f.md', line: 6, body: '```suggestion:-0+0\nSIX\n```' }])
  })

  it('suggests an insertion by repeating the line above it', () => {
    const patch = '--- a/f.md\n+++ b/f.md\n@@ -1,2 +1,3 @@\n one\n+one and a half\n two\n'
    expect(planSuggestions(parseUnifiedPatch(patch), target([1])).drafts[0]!.body).toBe('```suggestion:-0+0\none\none and a half\n```')
  })

  it('suggests a deletion with an empty block', () => {
    const patch = '--- a/f.md\n+++ b/f.md\n@@ -2,3 +2,2 @@\n two\n-three\n four\n'
    expect(planSuggestions(parseUnifiedPatch(patch), target([3])).drafts[0]!.body).toBe('```suggestion:-0+0\n```')
  })

  it('skips changes GitLab cannot take as suggestions', () => {
    const patch = [
      '--- /dev/null\n+++ b/new.md\n@@ -0,0 +1 @@\n+hi',
      '--- a/other.md\n+++ b/other.md\n@@ -1 +1 @@\n-x\n+y',
      '--- a/f.md\n+++ b/f.md\n@@ -1,2 +1,2 @@\n-one\n+ONE\n two',
      '--- a/f.md\n+++ b/f.md\n@@ -1 +1 @@\n-missing\n+x',
    ].join('\n')
    const plan = planSuggestions(parseUnifiedPatch(patch), path => path === 'f.md' ? target([5])() : null)
    expect(plan.drafts).toEqual([])
    expect(plan.skipped).toHaveLength(4)
    expect(plan.skipped[0]).toContain('create or delete')
    expect(plan.skipped[1]).toContain("isn't changed in the merge request")
    expect(plan.skipped[2]).toContain("aren't part of the merge request's diff")
    expect(plan.skipped[3]).toContain("doesn't match")
  })
})

describe('parseSuggestionRange', () => {
  it('reads the line offsets of a suggestion block', () => {
    expect(parseSuggestionRange('suggestion:-2+1')).toEqual({ above: 2, below: 1 })
    expect(parseSuggestionRange('suggestion')).toEqual({ above: 0, below: 0 })
    expect(parseSuggestionRange('ts')).toBeNull()
    expect(parseSuggestionRange(null)).toBeNull()
  })
})

describe('patchHasChanges', () => {
  it('needs at least one added or removed line', () => {
    expect(patchHasChanges('--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n a\n-b\n+c')).toBe(true)
    expect(patchHasChanges('--- a/x\n+++ b/x\n@@ -90,1 +90,1 @@\n glab api')).toBe(false)
  })
})
