import type { LocalChangedFile } from './local-changes'

export type ShipKind = 'commit' | 'push'

export type ShipStage = 'plan' | 'review' | 'commit' | 'update' | 'done'

export type ShipStepId = 'plan' | 'commit' | 'update'

export type ShipStepState = 'pending' | 'active' | 'done' | 'failed'

export interface ShipStep {
  id: ShipStepId
  label: string
  state: ShipStepState
}

export interface ShipStepsInput {
  kind: ShipKind
  stage: ShipStage
  failed: boolean
  branch: string
  reference: string
  commitCount: number
}

const STAGE_POSITION: Record<ShipStage, number> = { plan: 0, review: 1, commit: 1, update: 2, done: 3 }

function plural(count: number, word: string) {
  return count === 1 ? `1 ${word}` : `${count} ${word}s`
}

export function shipSteps(input: ShipStepsInput): ShipStep[] {
  const steps: Omit<ShipStep, 'state'>[] = [
    { id: 'plan', label: 'Plan commits with Claude' },
    {
      id: 'commit',
      label: input.kind === 'commit'
        ? `Commit and push to ${input.branch}`
        : `Push ${plural(input.commitCount, 'commit')} to ${input.branch}`,
    },
    { id: 'update', label: `Update ${input.reference}` },
  ]
  const position = STAGE_POSITION[input.stage]
  return steps
    .map((step, index): ShipStep => {
      if (index < position)
        return { ...step, state: 'done' }
      if (index > position)
        return { ...step, state: 'pending' }
      if (input.failed)
        return { ...step, state: 'failed' }
      return { ...step, state: input.stage === 'review' ? 'pending' : 'active' }
    })
    .filter(step => input.kind === 'commit' || step.id !== 'plan')
}

export function diffStat(files: LocalChangedFile[]) {
  return files.reduce(
    (total, file) => ({ additions: total.additions + file.additions, deletions: total.deletions + file.deletions }),
    { additions: 0, deletions: 0 },
  )
}
