import { describe, expect, it } from 'vitest'
import { buildCommitPlanPrompt, hunkLines, hunkPatch, leftoverUnits, moveUnit, normalizeCommitPlan, readCommitPlan, splitFile, splitHunks, splitInfo, validateCommits, withoutTitleTags } from './commit-plan'

const diff = [
  'diff --git a/SKILL.md b/SKILL.md',
  'index 1..2 100644',
  '--- a/SKILL.md',
  '+++ b/SKILL.md',
  '@@ -39,0 +40,2 @@ type',
  '+Rules:',
  '+- No colons',
  '@@ -87,0 +90 @@ Always add',
  '+- Never use Draft:',
  '@@ -94 +97 @@ Plus',
  '-Known to exist today',
  '+No matching label',
  '',
].join('\n')

const skill = { path: 'SKILL.md', status: 'modified', diff }
const files = [splitInfo(skill), { path: 'a.ts', hunkCount: 1, splittable: false }]

describe('hunks', () => {
  it('splits a file diff into its header and hunks', () => {
    const { header, hunks } = splitHunks(diff)
    expect(header).toHaveLength(4)
    expect(hunks.map(hunk => hunk[0])).toEqual(['@@ -39,0 +40,2 @@ type', '@@ -87,0 +90 @@ Always add', '@@ -94 +97 @@ Plus'])
    expect(hunkLines(hunks[0]!)).toEqual({ start: 40, end: 41 })
  })

  it('builds a patch with only the chosen hunks', () => {
    expect(hunkPatch(diff, [2])).toBe('diff --git a/SKILL.md b/SKILL.md\nindex 1..2 100644\n--- a/SKILL.md\n+++ b/SKILL.md\n@@ -94 +97 @@ Plus\n-Known to exist today\n+No matching label\n')
  })

  it('only splits modified text files with more than one hunk', () => {
    expect(splitInfo(skill)).toEqual({ path: 'SKILL.md', hunkCount: 3, splittable: true })
    expect(splitInfo({ ...skill, status: 'added' }).splittable).toBe(false)
    expect(splitInfo({ ...skill, untracked: true }).splittable).toBe(false)
  })
})

describe('withoutTitleTags', () => {
  it('drops merge request title tags and tickets', () => {
    expect(withoutTitleTags('[REPO][CI] chore: tighten skill rules [EN-000]')).toBe('chore: tighten skill rules')
    expect(withoutTitleTags('fix(api): keep [x] in text')).toBe('fix(api): keep [x] in text')
  })
})

describe('buildCommitPlanPrompt', () => {
  it('numbers the hunks of files that can be split and strips title tags', () => {
    const prompt = buildCommitPlanPrompt({ title: '[REPO] chore: add skill [EN-1]', branch: 'b', recentSubjects: ['[WEB] fix: x [EN-2]'], files: [skill] })
    expect(prompt).toContain('Merge request: chore: add skill')
    expect(prompt).toContain('- fix: x')
    expect(prompt).toContain('- modified: SKILL.md, can be split, 3 hunks')
    expect(prompt).toContain('Hunk 3:\n@@ -94 +97 @@ Plus')
  })
})

describe('readCommitPlan', () => {
  it('reads structured output with changes, and older plans with files', () => {
    const plan = { commits: [{ message: 'fix: a', changes: [{ path: 'a.ts', hunks: [] }] }] }
    expect(readCommitPlan({ structured_output: plan })).toEqual(plan.commits)
    expect(readCommitPlan({ result: '```json\n{"commits":[{"message":"fix: a","files":["a.ts"]}]}\n```' })).toEqual(plan.commits)
    expect(readCommitPlan({ result: 'no plan' })).toBeNull()
  })
})

describe('normalizeCommitPlan', () => {
  it('splits one file across commits by hunk and cleans messages', () => {
    const plan = normalizeCommitPlan([
      { message: '[REPO] docs: add title rules [EN-1]', changes: [{ path: 'SKILL.md', hunks: [1] }] },
      { message: 'docs: forbid Draft prefix', changes: [{ path: 'SKILL.md', hunks: [2] }, { path: 'a.ts', hunks: [] }] },
      { message: 'docs: drop label list', changes: [{ path: 'SKILL.md', hunks: [3, 9] }] },
    ], files)
    expect(plan.commits).toEqual([
      { message: 'docs: add title rules', files: ['SKILL.md'], hunks: { 'SKILL.md': [0] } },
      { message: 'docs: forbid Draft prefix', files: ['SKILL.md', 'a.ts'], hunks: { 'SKILL.md': [1] } },
      { message: 'docs: drop label list', files: ['SKILL.md'], hunks: { 'SKILL.md': [2] } },
    ])
  })

  it('puts forgotten hunks and files in the last commit and merges a fully covered file back to whole', () => {
    const plan = normalizeCommitPlan([
      { message: 'docs: a', changes: [{ path: 'SKILL.md', hunks: [1] }, { path: 'ghost.ts', hunks: [] }] },
      { message: 'docs: b', changes: [{ path: 'SKILL.md', hunks: [1, 2] }] },
    ], files)
    expect(plan.commits).toEqual([
      { message: 'docs: a', files: ['SKILL.md'], hunks: { 'SKILL.md': [0] } },
      { message: 'docs: b', files: ['SKILL.md', 'a.ts'], hunks: { 'SKILL.md': [1, 2] } },
    ])
  })

  it('takes a file that cannot be split as a whole', () => {
    expect(normalizeCommitPlan([{ message: 'x', changes: [{ path: 'a.ts', hunks: [1] }, { path: 'SKILL.md', hunks: [] }] }], files).commits)
      .toEqual([{ message: 'x', files: ['a.ts', 'SKILL.md'] }])
  })
})

describe('validateCommits', () => {
  it('needs a message, changes, and each file or hunk once', () => {
    expect(validateCommits([{ message: 'x', files: ['a.ts'] }], files)).toBeNull()
    expect(validateCommits([{ message: '', files: ['a.ts'] }], files)).toContain('needs a message')
    expect(validateCommits([{ message: 'x', files: ['a.ts'] }, { message: 'y', files: ['a.ts'] }], files)).toContain('more than one commit')
    expect(validateCommits([{ message: 'x', files: ['gone.ts'] }], files)).toContain('no local changes')
  })

  it('allows hunks of one file in different commits but not twice', () => {
    const split = (hunks: number[]) => ({ message: 'x', files: ['SKILL.md'], hunks: { 'SKILL.md': hunks } })
    expect(validateCommits([split([0]), split([1, 2])], files)).toBeNull()
    expect(validateCommits([split([0]), split([0])], files)).toContain('part of SKILL.md')
    expect(validateCommits([split([5])], files)).toContain('changed since the plan')
    expect(validateCommits([{ message: 'x', files: ['SKILL.md'] }, split([1])], files)).toContain('part of SKILL.md')
  })
})

describe('editing a plan', () => {
  const two = [{ message: 'a', files: ['SKILL.md'], hunks: { 'SKILL.md': [0, 1] } }, { message: 'b', files: ['a.ts'] }]

  it('moves one hunk to another commit', () => {
    expect(moveUnit(two, { path: 'SKILL.md', hunk: 1 }, 1)).toEqual([
      { message: 'a', files: ['SKILL.md'], hunks: { 'SKILL.md': [0] } },
      { message: 'b', files: ['a.ts', 'SKILL.md'], hunks: { 'SKILL.md': [1] } },
    ])
  })

  it('leaves a hunk out and lists it as uncommitted', () => {
    const plan = moveUnit(two, { path: 'SKILL.md', hunk: 0 }, -1)
    expect(plan[0]).toEqual({ message: 'a', files: ['SKILL.md'], hunks: { 'SKILL.md': [1] } })
    expect(leftoverUnits(plan, files)).toEqual([{ path: 'SKILL.md', hunk: 0 }, { path: 'SKILL.md', hunk: 2 }])
  })

  it('moves a whole file and splits a file into its hunks', () => {
    const whole = [{ message: 'a', files: ['SKILL.md'] }, { message: 'b', files: ['a.ts'] }]
    expect(moveUnit(whole, { path: 'SKILL.md', hunk: null }, 1)).toEqual([{ message: 'a', files: [] }, { message: 'b', files: ['a.ts', 'SKILL.md'] }])
    expect(splitFile(whole, 0, 'SKILL.md', 3)[0]).toEqual({ message: 'a', files: ['SKILL.md'], hunks: { 'SKILL.md': [0, 1, 2] } })
    expect(leftoverUnits(whole, files)).toEqual([])
  })
})
