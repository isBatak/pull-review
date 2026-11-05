import type { MrSummary } from './types'
import { describe, expect, it } from 'vitest'
import { analyzeStacks, groupIntoStacks, stackGuides } from './stacks'

const user = { id: 1, username: 'dev', name: 'Dev', avatarUrl: null, webUrl: '' }

function mr(iid: number, sourceBranch: string, targetBranch: string, title = `feat: ${iid}`): MrSummary {
  return {
    iid,
    title,
    draft: false,
    state: 'opened',
    webUrl: '',
    author: user,
    reviewers: [],
    sourceBranch,
    targetBranch,
    createdAt: '',
    updatedAt: '',
    mergedAt: null,
    closedAt: null,
    userNotesCount: 0,
    detailedMergeStatus: 'mergeable',
    hasConflicts: false,
    labels: [],
  }
}

describe('analyzeStacks', () => {
  it('follows target branches to compute depth and flags missing tags', () => {
    const mrs = [
      mr(6227, 'feat/settings', 'feat/upsell'),
      mr(6202, 'feat/upsell', 'feat/alerts'),
      mr(6185, 'feat/alerts', 'feat/pro-initial-release'),
    ]
    const info = analyzeStacks(mrs, 'develop')
    expect(info.get(6185)).toMatchObject({ depth: 1, parent: null, issues: [{ kind: 'parent-not-open', branch: 'feat/pro-initial-release' }, { kind: 'missing-tag', expected: { level: 1, part: null } }] })
    expect(info.get(6202)).toMatchObject({ depth: 2, issues: [{ kind: 'missing-tag', expected: { level: 2, part: null } }] })
    expect(info.get(6227)!.depth).toBe(3)
    expect(info.get(6227)!.parent!.iid).toBe(6202)
  })

  it('flags a stale stacked level after a parent was merged', () => {
    const mrs = [
      mr(6094, 'task/deps', 'develop'),
      mr(5998, 'task/react-query', 'task/deps', '[WEB] chore: update react query [EN-5655] [stacked-2]'),
    ]
    const info = analyzeStacks(mrs, 'develop')
    expect(info.get(5998)).toMatchObject({ depth: 1, issues: [{ kind: 'wrong-level', tagged: { level: 2, part: null }, expected: { level: 1, part: null } }] })
    expect(info.get(6094)).toMatchObject({ depth: 0, issues: [] })
  })

  it('flags a stacked tag on an MR that targets the default branch', () => {
    const info = analyzeStacks([mr(1, 'a', 'develop', 'fix [stacked-1]')], 'develop')
    expect(info.get(1)!.issues).toEqual([{ kind: 'tagged-but-not-stacked', tagged: { level: 1, part: null } }])
  })

  it('accepts a correct tag', () => {
    const info = analyzeStacks([mr(1, 'a', 'develop'), mr(2, 'b', 'a', 'feat [stacked-1]')], 'develop')
    expect(info.get(2)!.issues).toEqual([])
  })

  it('treats dotted tags as parts of one level', () => {
    const mrs = [
      mr(6565, 'task/naming', 'develop'),
      mr(6566, 'sub/docs', 'task/naming', 'docs [stacked-1]'),
      mr(6567, 'sub/amphora', 'sub/docs', 'amphora [stacked-2]'),
      mr(6571, 'sub/app', 'sub/amphora', 'app [stacked-3.1]'),
      mr(6573, 'sub/app-fetchers', 'sub/app', 'fetchers [stacked-3.2]'),
      mr(6581, 'sub/eslint', 'sub/app-fetchers', 'eslint [stacked-4]'),
    ]
    const info = analyzeStacks(mrs, 'develop')
    for (const item of mrs)
      expect(info.get(item.iid)!.issues).toEqual([])
    expect(info.get(6573)).toMatchObject({ depth: 4, expectedTag: { level: 3, part: 2 } })
    expect(info.get(6581)).toMatchObject({ depth: 5, expectedTag: { level: 4, part: null } })
  })

  it('flags a dotted part that skips a number', () => {
    const mrs = [
      mr(1, 'a', 'develop'),
      mr(2, 'b', 'a', 'x [stacked-1.1]'),
      mr(3, 'c', 'b', 'y [stacked-1.3]'),
    ]
    expect(analyzeStacks(mrs, 'develop').get(3)!.issues).toEqual([{ kind: 'wrong-level', tagged: { level: 1, part: 3 }, expected: { level: 1, part: 2 } }])
  })

  it('survives branch cycles and still lists every MR', () => {
    const mrs = [mr(1, 'a', 'b'), mr(2, 'b', 'a')]
    const info = analyzeStacks(mrs, 'develop')
    expect(info.get(1)!.depth).toBeGreaterThan(0)
    const listed = groupIntoStacks(mrs, info).flatMap(entry => entry.kind === 'single' ? [entry.mr.iid] : entry.stack.members.map(member => member.mr.iid))
    expect(listed.sort()).toEqual([1, 2])
  })
})

describe('groupIntoStacks', () => {
  it('nests stacked MRs under their root in parent order and keeps singles flat', () => {
    const mrs = [
      mr(10, 'solo', 'develop'),
      mr(6227, 'feat/settings', 'feat/upsell'),
      mr(6202, 'feat/upsell', 'feat/alerts'),
      mr(6185, 'feat/alerts', 'feat/pro'),
      mr(7, 'lonely', 'feat/missing'),
    ]
    const entries = groupIntoStacks(mrs, analyzeStacks(mrs, 'develop'))
    expect(entries.map(entry => entry.kind === 'single' ? entry.mr.iid : entry.stack.members.map(member => [member.mr.iid, member.depth]))).toEqual([
      10,
      [[6185, 1], [6202, 2], [6227, 3]],
      7,
    ])
  })
})

describe('stackGuides', () => {
  it('draws a single staircase for a chain', () => {
    expect(stackGuides([0, 1, 2])).toEqual([
      { passThrough: [], hasLaterSibling: false, hasChildren: true },
      { passThrough: [], hasLaterSibling: false, hasChildren: true },
      { passThrough: [], hasLaterSibling: false, hasChildren: false },
    ])
  })

  it('keeps a line going past children to a later sibling', () => {
    expect(stackGuides([0, 1, 2, 1])).toEqual([
      { passThrough: [], hasLaterSibling: false, hasChildren: true },
      { passThrough: [], hasLaterSibling: true, hasChildren: true },
      { passThrough: [1], hasLaterSibling: false, hasChildren: false },
      { passThrough: [], hasLaterSibling: false, hasChildren: false },
    ])
  })
})
