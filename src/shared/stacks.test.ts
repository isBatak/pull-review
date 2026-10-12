import type { MrSummary } from './types'
import { describe, expect, it } from 'vitest'
import { analyzeStacks, groupIntoStacks } from './stacks'

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
    expect(info.get(6185)).toMatchObject({ depth: 1, parent: null, issues: [{ kind: 'parent-not-open', branch: 'feat/pro-initial-release' }, { kind: 'missing-tag', depth: 1 }] })
    expect(info.get(6202)).toMatchObject({ depth: 2, issues: [{ kind: 'missing-tag', depth: 2 }] })
    expect(info.get(6227)!.depth).toBe(3)
    expect(info.get(6227)!.parent!.iid).toBe(6202)
  })

  it('flags a stale stacked level after a parent was merged', () => {
    const mrs = [
      mr(6094, 'task/deps', 'develop'),
      mr(5998, 'task/react-query', 'task/deps', '[WEB] chore: update react query [EN-5655] [stacked-2]'),
    ]
    const info = analyzeStacks(mrs, 'develop')
    expect(info.get(5998)).toMatchObject({ depth: 1, issues: [{ kind: 'wrong-level', tagged: 2, depth: 1 }] })
    expect(info.get(6094)).toMatchObject({ depth: 0, issues: [] })
  })

  it('flags a stacked tag on an MR that targets the default branch', () => {
    const info = analyzeStacks([mr(1, 'a', 'develop', 'fix [stacked-1]')], 'develop')
    expect(info.get(1)!.issues).toEqual([{ kind: 'tagged-but-not-stacked', tagged: 1 }])
  })

  it('accepts a correct tag', () => {
    const info = analyzeStacks([mr(1, 'a', 'develop'), mr(2, 'b', 'a', 'feat [stacked-1]')], 'develop')
    expect(info.get(2)!.issues).toEqual([])
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
