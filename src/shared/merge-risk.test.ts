import type { RiskRow } from './merge-risk'
import { describe, expect, it } from 'vitest'
import { scoreMergeRisk, sortRiskRows } from './merge-risk'

const rows = (verdicts: Record<RiskRow['category'], RiskRow['verdict']>): RiskRow[] =>
  Object.entries(verdicts).map(([category, verdict]) => ({ category, verdict }) as RiskRow)

describe('scoreMergeRisk', () => {
  it('scores the example from the skill as medium', () => {
    expect(scoreMergeRisk(rows({ alignment: 'good', impact: 'small', verification: 'poor', rollback: 'low', errors: 'decent' }))).toBe('medium')
  })

  it('gives low when every category is at its best, n/a included', () => {
    expect(scoreMergeRisk(rows({ alignment: 'good', impact: 'small', verification: 'good', rollback: 'low', errors: 'n/a' }))).toBe('low')
  })

  it('gives high when the heavy categories are bad', () => {
    expect(scoreMergeRisk(rows({ alignment: 'good', impact: 'large', verification: 'poor', rollback: 'medium', errors: 'decent' }))).toBe('high')
  })

  it('splits low and medium at 1.5', () => {
    expect(scoreMergeRisk(rows({ alignment: 'poor', impact: 'small', verification: 'good', rollback: 'low', errors: 'poor' }))).toBe('medium')
    expect(scoreMergeRisk(rows({ alignment: 'decent', impact: 'small', verification: 'good', rollback: 'medium', errors: 'decent' }))).toBe('low')
  })

  it('splits medium and high at 2.25', () => {
    expect(scoreMergeRisk(rows({ alignment: 'good', impact: 'medium', verification: 'poor', rollback: 'medium', errors: 'poor' }))).toBe('high')
    expect(scoreMergeRisk(rows({ alignment: 'good', impact: 'medium', verification: 'poor', rollback: 'medium', errors: 'decent' }))).toBe('medium')
  })

  it('scores what is there and gives nothing for no rows', () => {
    expect(scoreMergeRisk([{ category: 'impact', verdict: 'large' }])).toBe('high')
    expect(scoreMergeRisk([])).toBeNull()
  })
})

describe('sortRiskRows', () => {
  it('puts the categories in the order of the skill', () => {
    const sorted = sortRiskRows([{ category: 'errors', verdict: 'good' }, { category: 'alignment', verdict: 'good' }, { category: 'impact', verdict: 'small' }])
    expect(sorted.map(row => row.category)).toEqual(['alignment', 'impact', 'errors'])
  })
})
