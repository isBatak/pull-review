import type { PlannedCommit } from '../../../shared/commit-plan'
import type { LocalChangedFile, UnpushedCommit } from '../../../shared/local-changes'
import type { ShipKind, ShipStage, ShipStepState } from '../../../shared/ship-flow'
import type { MrRef } from '../../../shared/types'
import { Check, GitCommitHorizontal, Loader2, Upload, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { css, cx } from 'styled-system/css'
import { mrKey } from '../../../shared/mr-ref'
import { mrReference } from '../../../shared/merge-status'
import { shipSteps } from '../../../shared/ship-flow'
import { mergeStatusKey } from '../../hooks/use-merge-request'
import { api } from '../../lib/api'
import { localChangesKey } from '../../lib/local-repos'
import { useSettings } from '../../lib/settings'
import { Button } from '../ui/button'

const UPDATE_POLL_MS = 2_000
const UPDATE_POLL_TRIES = 30

interface ShipCommit {
  subject: string
  files: number
  sha: string | null
}

interface ShipRun {
  kind: ShipKind
  stage: ShipStage
  error: string | null
  plan: PlannedCommit[]
  commits: ShipCommit[]
}

function subjectOf(message: string) {
  return message.trim().split('\n')[0] ?? ''
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function useShipFlow(mrRef: MrRef, repoPath: string | null) {
  const queryClient = useQueryClient()
  const [settings] = useSettings()
  const [run, setRun] = useState<ShipRun | null>(null)

  const update = (patch: Partial<ShipRun>) => setRun(current => (current ? { ...current, ...patch } : current))
  const fail = (cause: unknown) => update({ error: cause instanceof Error ? cause.message : String(cause) })

  async function waitForMergeRequest(sha: string) {
    update({ stage: 'update' })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: localChangesKey(mrRef, repoPath) }),
      queryClient.invalidateQueries({ queryKey: ['mr', mrKey(mrRef)] }),
    ])
    for (let attempt = 0; attempt < UPDATE_POLL_TRIES; attempt++) {
      const status = await api.mergeStatus(mrRef)
      queryClient.setQueryData(mergeStatusKey(mrRef), status)
      if (status.headSha === sha)
        break
      await wait(UPDATE_POLL_MS)
    }
    update({ stage: 'done' })
  }

  async function start(files: LocalChangedFile[], unpushed: UnpushedCommit[]) {
    if (!repoPath)
      return
    if (!files.length) {
      setRun({ kind: 'push', stage: 'review', error: null, plan: [], commits: unpushed.map(commit => ({ subject: commit.subject, files: 0, sha: commit.sha })) })
      return
    }
    setRun({ kind: 'commit', stage: 'plan', error: null, plan: [], commits: [] })
    try {
      const { commits } = await api.planCommits(mrRef, { repoPath, model: settings.commitModel, effort: settings.commitEffort })
      update({ stage: 'review', plan: commits, commits: commits.map(commit => ({ subject: subjectOf(commit.message), files: commit.files.length, sha: null })) })
    }
    catch (cause) {
      fail(cause)
    }
  }

  async function confirm() {
    if (!run || !repoPath)
      return
    update({ stage: 'commit', error: null })
    try {
      if (run.kind === 'push') {
        await api.pushLocalCommits(mrRef, repoPath)
        await waitForMergeRequest(run.commits[0]!.sha!)
        return
      }
      const result = await api.commitLocalChanges(mrRef, { repoPath, commits: run.plan, push: true, skipHooks: false })
      update({ commits: result.commits.map((made, index) => ({ subject: made.subject, files: run.plan[index]?.files.length ?? 0, sha: made.sha })) })
      if (!result.pushed) {
        void queryClient.invalidateQueries({ queryKey: localChangesKey(mrRef, repoPath) })
        throw new Error(`The commits were made but not pushed. ${result.pushError ?? ''}`.trim())
      }
      await waitForMergeRequest(result.commits.at(-1)!.sha)
    }
    catch (cause) {
      fail(cause)
    }
  }

  return { run, start, confirm, dismiss: () => setRun(null) }
}

export type ShipFlow = ReturnType<typeof useShipFlow>

export function shipChipLabel(run: ShipRun) {
  if (run.error)
    return run.stage === 'plan' ? 'Planning failed' : run.kind === 'push' ? 'Push failed' : 'Commit failed'
  if (run.stage === 'plan')
    return 'Planning commits'
  if (run.stage === 'review')
    return run.kind === 'push' ? 'Ready to push' : 'Ready to commit'
  if (run.stage === 'commit')
    return run.kind === 'push' ? 'Pushing' : 'Committing'
  if (run.stage === 'update')
    return 'Updating'
  return 'Pushed'
}

const STEP_COLOR: Record<ShipStepState, string> = {
  pending: css({ color: 'fg.subtle' }),
  active: css({ color: 'fg.default' }),
  done: css({ color: 'fg.muted' }),
  failed: css({ color: 'danger.fg' }),
}

const markerSize = css({ w: '3.5', h: '3.5', flexShrink: 0 })

function StepMarker({ state }: { state: ShipStepState }) {
  if (state === 'active')
    return <Loader2 aria-hidden className={cx(markerSize, css({ color: 'blue.500', animation: 'spin' }))} />
  if (state === 'done')
    return <Check aria-hidden className={cx(markerSize, css({ color: 'success.fg' }))} />
  if (state === 'failed')
    return <X aria-hidden className={cx(markerSize, css({ color: 'danger.fg' }))} />
  return <span aria-hidden className={css({ w: '2', h: '2', borderRadius: 'full', borderWidth: '1.5px', borderColor: 'fg.subtle', flexShrink: 0 })} />
}

function CommitList({ commits }: { commits: ShipCommit[] }) {
  return (
    <ul className={css({ display: 'flex', flexDir: 'column', gap: '1', ml: '1.5', pl: '3.5', borderLeftWidth: '1.5px', borderColor: 'border.default' })}>
      {commits.map((commit, index) => (
        <li key={commit.sha ?? index} className={css({ display: 'flex', alignItems: 'baseline', gap: '1.5', fontSize: 'xs', minW: '0' })}>
          <GitCommitHorizontal className={css({ w: '3', h: '3', color: 'fg.subtle', flexShrink: 0, alignSelf: 'center' })} />
          <span className={css({ truncate: true, color: 'fg.default' })} title={commit.subject}>{commit.subject}</span>
          {commit.sha
            ? <span className={css({ fontFamily: 'mono', color: 'fg.subtle', flexShrink: 0 })}>{commit.sha.slice(0, 7)}</span>
            : <span className={css({ color: 'fg.subtle', flexShrink: 0 })}>{commit.files === 1 ? '1 file' : `${commit.files} files`}</span>}
        </li>
      ))}
    </ul>
  )
}

export function ShipCard({ mrRef, branch, flow }: { mrRef: MrRef, branch: string, flow: ShipFlow }) {
  const run = flow.run
  if (!run)
    return null
  const steps = shipSteps({
    kind: run.kind,
    stage: run.stage,
    failed: run.error !== null,
    branch,
    reference: mrReference(mrRef.iid),
    commitCount: run.commits.length,
  })
  const finished = run.stage === 'done' || run.error !== null
  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '2', px: '2.5', py: '2', borderTopWidth: '1px', borderColor: 'border.subtle' })}>
      <ol aria-label="Commit and push progress" className={css({ display: 'flex', flexDir: 'column', gap: '1.5' })}>
        {steps.map(step => (
          <li key={step.id} className={css({ display: 'flex', flexDir: 'column', gap: '1.5' })}>
            <span className={cx(css({ display: 'flex', alignItems: 'center', gap: '2', fontSize: 'xs' }), STEP_COLOR[step.state])}>
              <span className={css({ display: 'inline-flex', justifyContent: 'center', w: '3.5' })}><StepMarker state={step.state} /></span>
              {step.label}
            </span>
            {step.id === (run.kind === 'commit' ? 'plan' : 'commit') && run.commits.length > 0 && <CommitList commits={run.commits} />}
          </li>
        ))}
      </ol>
      {run.error && <p className={css({ fontSize: 'xs', color: 'danger.fg', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>{run.error}</p>}
      {run.stage === 'review' && !run.error && (
        <p className={css({ fontSize: 'xs', color: 'fg.muted' })}>
          {`This pushes to ${branch}, so the merge request updates for everyone. It never force-pushes. To change the commits, cancel and use the Local changes tab.`}
        </p>
      )}
      {(run.stage === 'review' || finished) && (
        <div className={css({ display: 'flex', justifyContent: 'flex-end', gap: '1.5' })}>
          {run.stage === 'review' && !run.error
            ? (
                <>
                  <Button size="xs" variant="ghost" onClick={flow.dismiss}>Cancel</Button>
                  <Button size="xs" variant="solid" onClick={() => void flow.confirm()}>
                    <Upload />
                    {run.kind === 'push' ? 'Push' : 'Commit and push'}
                  </Button>
                </>
              )
            : <Button size="xs" variant="ghost" onClick={flow.dismiss}>{run.error ? 'Close' : 'Done'}</Button>}
        </div>
      )}
    </div>
  )
}
