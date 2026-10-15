import { describe, expect, it } from 'vitest'
import { normalizeCommitPlan, readCommitPlan, validateCommits } from './commit-plan'

describe('readCommitPlan', () => {
  it('reads structured output, or JSON in the result text', () => {
    const plan = { commits: [{ message: 'fix: a', files: ['a.ts'] }] }
    expect(readCommitPlan({ structured_output: plan })).toEqual(plan)
    expect(readCommitPlan({ result: `Here you go:\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\`` })).toEqual(plan)
    expect(readCommitPlan({ result: 'no plan' })).toBeNull()
  })
})

describe('normalizeCommitPlan', () => {
  it('drops unknown and repeated files and puts forgotten files in the last commit', () => {
    const plan = { commits: [{ message: ' fix: a ', files: ['a.ts', 'ghost.ts'] }, { message: 'test: b', files: ['a.ts', 'b.ts'] }] }
    expect(normalizeCommitPlan(plan, ['a.ts', 'b.ts', 'c.ts'])).toEqual({
      commits: [{ message: 'fix: a', files: ['a.ts'] }, { message: 'test: b', files: ['b.ts', 'c.ts'] }],
    })
  })
})

describe('validateCommits', () => {
  it('needs a message and files, and each file once', () => {
    expect(validateCommits([{ message: 'x', files: ['a.ts'] }], ['a.ts'])).toBeNull()
    expect(validateCommits([{ message: '', files: ['a.ts'] }], ['a.ts'])).toContain('needs a message')
    expect(validateCommits([{ message: 'x', files: ['a.ts'] }, { message: 'y', files: ['a.ts'] }], ['a.ts'])).toContain('more than one commit')
    expect(validateCommits([{ message: 'x', files: ['gone.ts'] }], ['a.ts'])).toContain('no local changes')
  })
})
