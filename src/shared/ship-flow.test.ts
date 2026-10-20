import type { LocalChangedFile } from './local-changes'
import type { ShipStepsInput } from './ship-flow'
import { describe, expect, it } from 'vitest'
import { diffStat, shipSteps } from './ship-flow'

function steps(overrides: Partial<ShipStepsInput>) {
  return shipSteps({ kind: 'commit', stage: 'plan', failed: false, branch: 'feat/x', reference: '!128', commitCount: 2, ...overrides })
    .map(step => `${step.id}:${step.state}`)
}

describe('shipSteps', () => {
  it('walks through planning, committing and updating', () => {
    expect(steps({ stage: 'plan' })).toEqual(['plan:active', 'commit:pending', 'update:pending'])
    expect(steps({ stage: 'commit' })).toEqual(['plan:done', 'commit:active', 'update:pending'])
    expect(steps({ stage: 'update' })).toEqual(['plan:done', 'commit:done', 'update:active'])
    expect(steps({ stage: 'done' })).toEqual(['plan:done', 'commit:done', 'update:done'])
  })

  it('waits on the commit step while the plan is reviewed', () => {
    expect(steps({ stage: 'review' })).toEqual(['plan:done', 'commit:pending', 'update:pending'])
  })

  it('marks the current step as failed', () => {
    expect(steps({ stage: 'commit', failed: true })).toEqual(['plan:done', 'commit:failed', 'update:pending'])
  })

  it('skips planning when only commits are left to push', () => {
    const result = shipSteps({ kind: 'push', stage: 'commit', failed: false, branch: 'feat/x', reference: '!128', commitCount: 1 })
    expect(result.map(step => step.label)).toEqual(['Push 1 commit to feat/x', 'Update !128'])
    expect(result.map(step => step.state)).toEqual(['active', 'pending'])
  })
})

describe('diffStat', () => {
  it('adds up the changed lines', () => {
    const file = (additions: number, deletions: number) => ({ additions, deletions }) as LocalChangedFile
    expect(diffStat([file(10, 2), file(5, 0)])).toEqual({ additions: 15, deletions: 2 })
    expect(diffStat([])).toEqual({ additions: 0, deletions: 0 })
  })
})
