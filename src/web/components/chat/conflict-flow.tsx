import type { ConflictFile, SyncedFile, SyncJob } from '../../../shared/conflicts'
import type { MrRef } from '../../../shared/types'
import { ChevronRight, Eye, Sparkles, Undo2, Upload } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { css, cx } from 'styled-system/css'
import { mrKey } from '../../../shared/mr-ref'
import { mrReference } from '../../../shared/merge-status'
import { syncSteps } from '../../../shared/conflicts'
import { api } from '../../lib/api'
import { useSettings } from '../../lib/settings'
import { waitForHead } from '../../lib/wait-for-head'
import { ChangesDialog } from '../changes-dialog'
import { PatchFileCard } from '../patch-file-card'
import { Button } from '../ui/button'
import { StepMarker } from './ship-flow'

const JOB_POLL_MS = 1_500
const RUNNING = new Set<SyncJob['phase']>(['apply', 'resolve', 'push'])

const syncJobKey = (ref: MrRef) => ['sync-job', mrKey(ref)] as const

export function useConflictFlow(mrRef: MrRef, repoPath: string | null, headSha: string, gitlabHead: string | null) {
  const queryClient = useQueryClient()
  const [settings] = useSettings()
  const [open, setOpen] = useState(false)
  const [updated, setUpdated] = useState(false)
  const jobQuery = useQuery({
    queryKey: syncJobKey(mrRef),
    queryFn: () => api.syncJob(mrRef),
    refetchInterval: query => (query.state.data?.job && RUNNING.has(query.state.data.job.phase) ? JOB_POLL_MS : false),
  })
  const job = jobQuery.data?.job ?? null
  const reachedGitlab = Boolean(job?.phase === 'pushed' && job.newHead && job.newHead === gitlabHead)
  const report = useQuery({
    queryKey: ['conflicts', mrKey(mrRef), repoPath, headSha],
    queryFn: () => api.conflicts(mrRef, repoPath!),
    enabled: open && Boolean(repoPath) && !job,
    retry: false,
    staleTime: 60_000,
  })
  const setJob = (data: { job: SyncJob | null }) => queryClient.setQueryData(syncJobKey(mrRef), data)

  const start = useMutation({
    mutationFn: () => api.startSync(mrRef, { repoPath: repoPath!, model: settings.commitModel, effort: settings.commitEffort }),
    onSuccess: setJob,
  })
  const push = useMutation({
    mutationFn: async () => {
      const result = await api.pushSync(mrRef)
      setJob(result)
      if (result.job?.newHead)
        await waitForHead(queryClient, mrRef, repoPath, result.job.newHead)
      setUpdated(true)
    },
  })
  const undo = useMutation({ mutationFn: () => api.undoSync(mrRef), onSuccess: setJob })
  const dismiss = useMutation({
    mutationFn: () => api.dismissSync(mrRef),
    onSuccess: (data) => {
      setJob(data)
      setOpen(false)
      setUpdated(false)
    },
  })

  return {
    open: open || job !== null,
    show: () => setOpen(true),
    close: () => setOpen(false),
    job,
    report,
    updated: updated || reachedGitlab,
    start,
    push,
    undo,
    dismiss,
    error: start.error ?? push.error ?? undo.error ?? dismiss.error,
  }
}

export type ConflictFlow = ReturnType<typeof useConflictFlow>

export function conflictChipLabel(flow: ConflictFlow): string | null {
  const job = flow.job
  if (!job)
    return null
  if (job.phase === 'failed')
    return 'Fix failed'
  if (job.phase === 'apply')
    return job.strategy === 'rebase' ? 'Rebasing' : 'Merging'
  if (job.phase === 'resolve')
    return 'Fixing conflicts'
  if (job.phase === 'review')
    return 'Review the fixes'
  if (job.phase === 'push')
    return 'Pushing'
  if (job.phase === 'pushed' && !flow.updated)
    return 'Updating'
  return null
}

const codeBlock = css({ fontFamily: 'mono', fontSize: '2xs', lineHeight: '1.5', whiteSpace: 'pre', overflowX: 'auto', px: '2', py: '1', borderRadius: 'sm' })

function ConflictPreview({ file, target }: { file: ConflictFile, target: string }) {
  return (
    <details className={css({ '&[open] > summary svg': { transform: 'rotate(90deg)' } })}>
      <summary className={css({ display: 'flex', alignItems: 'center', gap: '1.5', fontSize: 'xs', cursor: 'pointer', listStyle: 'none', '&::-webkit-details-marker': { display: 'none' } })}>
        <ChevronRight className={css({ w: '3', h: '3', color: 'fg.subtle', flexShrink: 0, transition: 'transform 0.15s' })} />
        <span className={css({ fontFamily: 'mono', truncate: true, flex: '1', minW: '0' })} title={file.path}>{file.path}</span>
        <span className={css({ color: 'warning.fg', flexShrink: 0 })}>{file.hunks.length === 1 ? '1 conflict' : `${file.hunks.length} conflicts`}</span>
      </summary>
      <div className={css({ display: 'flex', flexDir: 'column', gap: '2', mt: '1.5', ml: '4.5' })}>
        {file.hunks.map(hunk => (
          <div key={hunk.line} className={css({ display: 'flex', flexDir: 'column', gap: '1' })}>
            <span className={css({ fontSize: '2xs', color: 'fg.subtle' })}>{`Line ${hunk.line}`}</span>
            <span className={css({ fontSize: '2xs', color: 'fg.muted' })}>This merge request</span>
            <div className={cx(codeBlock, css({ bg: 'success.subtle' }))}>{hunk.ours.join('\n') || ' '}</div>
            <span className={css({ fontSize: '2xs', color: 'fg.muted' })}>{target}</span>
            <div className={cx(codeBlock, css({ bg: 'warning.subtle' }))}>{hunk.theirs.join('\n') || ' '}</div>
          </div>
        ))}
      </div>
    </details>
  )
}

function FixedFile({ file, onShow }: { file: SyncedFile, onShow: () => void }) {
  return (
    <li className={css({ display: 'flex', flexDir: 'column', gap: '0.5' })}>
      <span className={css({ display: 'flex', alignItems: 'center', gap: '1.5', fontSize: 'xs' })}>
        <span className={css({ fontFamily: 'mono', truncate: true, flex: '1', minW: '0' })} title={file.path}>{file.path}</span>
        <Button size="xs" variant="ghost" onClick={onShow}>
          <Eye />
          Show
        </Button>
      </span>
      {file.explanation && <span className={css({ fontSize: 'xs', color: 'fg.muted' })}>{file.explanation}</span>}
    </li>
  )
}

function Report({ flow, repoPath }: { flow: ConflictFlow, repoPath: string | null }) {
  if (!repoPath)
    return <p className={css({ fontSize: 'xs', color: 'fg.muted' })}>Add a local folder for this project with Add folder at the top of the chat. Claude fixes the conflicts there.</p>
  if (flow.report.isLoading)
    return <p className={css({ fontSize: 'xs', color: 'fg.muted' })}>Checking which files conflict…</p>
  if (flow.report.error)
    return <p className={css({ fontSize: 'xs', color: 'danger.fg' })}>{flow.report.error.message}</p>
  const report = flow.report.data
  if (!report)
    return null
  const how = report.strategy === 'rebase'
    ? `Claude rebases this branch onto ${report.target} and fixes each conflict. You review the fixes before anything is pushed.`
    : `Claude merges ${report.target} into this branch and fixes the conflicts. You review the fixes before anything is pushed.`
  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '2' })}>
      <p className={css({ fontSize: 'xs', color: 'fg.muted' })}>
        {report.files.length
          ? `${report.files.length === 1 ? '1 file conflicts' : `${report.files.length} files conflict`} with ${report.target}, which is ${report.behind === 1 ? '1 commit' : `${report.behind} commits`} ahead.`
          : `No conflicts with ${report.target} on this computer. GitLab may still be checking.`}
      </p>
      {report.files.map(file => <ConflictPreview key={file.path} file={file} target={report.target} />)}
      {report.files.length > 0 && <p className={css({ fontSize: 'xs', color: 'fg.muted' })}>{how}</p>}
    </div>
  )
}

export function ConflictCard({ mrRef, branch, flow, repoPath }: { mrRef: MrRef, branch: string, flow: ConflictFlow, repoPath: string | null }) {
  const [shown, setShown] = useState<SyncedFile | null>(null)
  if (!flow.open)
    return null
  const job = flow.job
  const busy = flow.start.isPending || flow.push.isPending || flow.undo.isPending || flow.dismiss.isPending
  const finished = job && (job.phase === 'failed' || (job.phase === 'pushed' && flow.updated))
  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '2', px: '2.5', py: '2', borderTopWidth: '1px', borderColor: 'border.subtle' })}>
      {!job && <Report flow={flow} repoPath={repoPath} />}
      {job && (
        <ol aria-label="Conflict fix progress" className={css({ display: 'flex', flexDir: 'column', gap: '1.5' })}>
          {syncSteps(job, { reference: mrReference(mrRef.iid), branch, updated: flow.updated }).map(step => (
            <li key={step.id} className={css({ display: 'flex', flexDir: 'column', gap: '1' })}>
              <span className={css({ display: 'flex', alignItems: 'center', gap: '2', fontSize: 'xs', color: step.state === 'pending' ? 'fg.subtle' : step.state === 'failed' ? 'danger.fg' : 'fg.default' })}>
                <span className={css({ display: 'inline-flex', justifyContent: 'center', w: '3.5' })}><StepMarker state={step.state} /></span>
                {step.label}
              </span>
              {step.id === 'fix' && job.progress && <span className={css({ ml: '5.5', fontSize: 'xs', color: 'fg.muted' })}>{job.progress}</span>}
              {step.id === 'review' && job.newHead && (
                <ul className={css({ display: 'flex', flexDir: 'column', gap: '1.5', ml: '5.5' })}>
                  {job.files.length
                    ? job.files.map(file => <FixedFile key={file.path} file={file} onShow={() => setShown(file)} />)
                    : <li className={css({ fontSize: 'xs', color: 'fg.muted' })}>{`No conflicts. The branch is now up to date with ${job.target}.`}</li>}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      {job?.error && <p className={css({ fontSize: 'xs', color: 'danger.fg', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>{job.error}</p>}
      {job?.phase === 'review' && job.strategy === 'rebase' && (
        <p className={css({ fontSize: 'xs', color: 'fg.muted' })}>
          {`A rebase rewrites ${branch}, so this is a force push. It only goes through if nobody pushed to ${branch} since the fix started.`}
        </p>
      )}
      {flow.error && <p className={css({ fontSize: 'xs', color: 'danger.fg', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>{flow.error.message}</p>}
      <div className={css({ display: 'flex', justifyContent: 'flex-end', gap: '1.5' })}>
        {!job && (
          <>
            <Button size="xs" variant="ghost" onClick={flow.close}>Close</Button>
            {(flow.report.data?.files.length ?? 0) > 0 && (
              <Button size="xs" variant="solid" disabled={busy} onClick={() => flow.start.mutate()}>
                <Sparkles />
                Fix with Claude
              </Button>
            )}
          </>
        )}
        {job?.phase === 'review' && (
          <>
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => flow.undo.mutate()}>
              <Undo2 />
              Undo
            </Button>
            <Button size="xs" variant="solid" disabled={busy} onClick={() => flow.push.mutate()}>
              <Upload />
              {job.strategy === 'rebase' ? 'Force push' : 'Push'}
            </Button>
          </>
        )}
        {finished && <Button size="xs" variant="ghost" disabled={busy} onClick={() => flow.dismiss.mutate()}>{job.phase === 'failed' ? 'Close' : 'Done'}</Button>}
      </div>
      <ChangesDialog
        open={shown !== null}
        onClose={() => setShown(null)}
        title={shown?.path ?? ''}
        description={job ? `What this merge request changes in the file on top of ${job.target}, after the fix.` : undefined}
      >
        {shown && <PatchFileCard path={shown.path} diff={shown.diff} />}
      </ChangesDialog>
    </div>
  )
}
