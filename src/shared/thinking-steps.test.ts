import { describe, expect, it } from 'vitest'
import { stepsFromTools } from './thinking-steps'

const tool = (id: string, name: string, detail: string | null = null) => ({ id, name, detail })

describe('stepsFromTools', () => {
  it('groups consecutive searches and reads into one step each', () => {
    const steps = stepsFromTools([
      tool('1', 'Grep', 'makeAutoObservable'),
      tool('2', 'Glob', '**/*.ts'),
      tool('3', 'Read', 'src/router.ts'),
      tool('4', 'Read', 'src/auth.ts'),
      tool('5', 'Read', 'src/router.ts'),
    ])
    expect(steps.map(step => [step.kind, step.doneLabel, step.items])).toEqual([
      ['search', 'Searched the codebase', ['makeAutoObservable', '**/*.ts']],
      ['read', 'Read 2 files', ['src/router.ts', 'src/auth.ts']],
    ])
  })

  it('starts a new step when the kind changes back', () => {
    const steps = stepsFromTools([tool('1', 'Read', 'a.ts'), tool('2', 'Grep', 'x'), tool('3', 'Read', 'b.ts')])
    expect(steps.map(step => step.kind)).toEqual(['read', 'search', 'read'])
  })

  it('names the structured output step after what is written', () => {
    const [step] = stepsFromTools([tool('1', 'StructuredOutput', null)], 'the review')
    expect(step).toMatchObject({ kind: 'write', doneLabel: 'Wrote the review', activeLabel: 'Writing the review', items: [] })
  })

  it('reads one file in the singular', () => {
    expect(stepsFromTools([tool('1', 'Read', 'a.ts')])[0]!.activeLabel).toBe('Reading 1 file')
  })
})
