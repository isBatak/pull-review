import type { MergeStatus, MrRef } from '../../../shared/types'
import type { MergeSummary, MergeTone } from '../../../shared/merge-status'
import { ChevronDown, ExternalLink, GitMerge, Loader2, Upload } from 'lucide-react'
import { useState } from 'react'
import { css, cx } from 'styled-system/css'
import { mrReference, summarizeJobs, summarizeMergeStatus } from '../../../shared/merge-status'
import { useApprovals, useDiscussions, useMergeActions, useMergeStatus } from '../../hooks/use-merge-request'
import { useLocalChanges } from '../../lib/local-repos'
import { openExternal } from '../../lib/platform'
import { diffStat } from '../../../shared/ship-flow'
import type { LocalChangedFile, UnpushedCommit } from '../../../shared/local-changes'
import { useReview } from '../review-context'
import { Button } from '../ui/button'
import type { ShipFlow } from './ship-flow'
import { ShipCard, shipChipLabel, useShipFlow } from './ship-flow'

const TONE_COLOR: Record<MergeTone, string> = {
  idle: css({ color: 'fg.subtle' }),
  work: css({ color: 'blue.500' }),
  warn: css({ color: 'warning.fg' }),
  fail: css({ color: 'danger.fg' }),
  ok: css({ color: 'success.fg' }),
  done: css({ color: 'accent.fg' }),
}

const TONE_DOT: Record<MergeTone, string> = {
  idle: css({ bg: 'fg.subtle' }),
  work: css({ bg: 'blue.500' }),
  warn: css({ bg: 'warning.fg' }),
  fail: css({ bg: 'danger.fg' }),
  ok: css({ bg: 'success.fg' }),
  done: css({ bg: 'accent.fg' }),
}

const PIPELINE_LABELS: Record<string, { tone: MergeTone, label: string }> = {
  success: { tone: 'ok', label: 'Pipeline passed' },
  failed: { tone: 'fail', label: 'Pipeline failed' },
  canceled: { tone: 'fail', label: 'Pipeline canceled' },
  skipped: { tone: 'idle', label: 'Pipeline skipped' },
  manual: { tone: 'warn', label: 'Pipeline waits for a manual job' },
  blocked: { tone: 'warn', label: 'Pipeline blocked' },
}

const iconSize = css({ w: '3.5', h: '3.5', flexShrink: 0 })

function Dot({ tone }: { tone: MergeTone }) {
  if (tone === 'work')
    return <Loader2 aria-hidden className={cx(iconSize, TONE_COLOR.work, css({ animation: 'spin' }))} />
  return <span aria-hidden className={cx(css({ w: '2', h: '2', borderRadius: 'full', flexShrink: 0 }), TONE_DOT[tone])} />
}

interface CheckRow {
  tone: MergeTone
  label: string
  url?: string
  children?: React.ReactNode
}

function pipelineRow(status: MergeStatus): CheckRow {
  const pipeline = status.pipeline
  if (!pipeline)
    return { tone: 'idle', label: 'No pipeline' }
  const jobs = summarizeJobs(pipeline.jobs)
  const known = PIPELINE_LABELS[pipeline.status]
  const row: CheckRow = known
    ? { ...known, url: pipeline.webUrl }
    : { tone: 'work', label: `Pipeline running, ${jobs.done} of ${jobs.total} jobs done`, url: pipeline.webUrl }
  if (jobs.failed.length) {
    row.children = (
      <ul className={css({ display: 'flex', flexDir: 'column', gap: '0.5', pl: '5' })}>
        {jobs.failed.map(job => (
          <li key={job.id}>
            <button type="button" onClick={() => openExternal(job.webUrl)} className={css({ fontSize: 'xs', color: 'danger.fg', cursor: 'pointer', _hover: { textDecoration: 'underline' } })}>
              {job.name}
            </button>
          </li>
        ))}
      </ul>
    )
  }
  return row
}

function useCheckRows(mrRef: MrRef, status: MergeStatus): CheckRow[] {
  const approvals = useApprovals(mrRef).data
  const discussions = useDiscussions(mrRef).data
  const rows: CheckRow[] = [pipelineRow(status)]
  if (approvals) {
    const given = approvals.approvedBy.length
    rows.push(approvals.approvalsRequired
      ? { tone: approvals.approvalsLeft ? 'warn' : 'ok', label: `${given} of ${approvals.approvalsRequired} approvals` }
      : { tone: 'ok', label: given ? `${given} approvals, none required` : 'No approvals required' })
  }
  if (discussions) {
    const open = discussions.filter(discussion => discussion.resolvable && !discussion.resolved).length
    rows.push(open
      ? { tone: 'warn', label: open === 1 ? '1 open thread' : `${open} open threads` }
      : { tone: 'ok', label: 'All threads resolved' })
  }
  rows.push(status.hasConflicts
    ? { tone: 'warn', label: `Conflicts with ${status.targetBranch}` }
    : { tone: 'ok', label: `No conflicts with ${status.targetBranch}` })
  if (status.draft)
    rows.push({ tone: 'idle', label: 'Marked as draft' })
  if (status.mergeError)
    rows.push({ tone: 'fail', label: status.mergeError })
  return rows
}

function Checks({ mrRef, status }: { mrRef: MrRef, status: MergeStatus }) {
  const rows = useCheckRows(mrRef, status)
  return (
    <ul aria-label="Merge checks" className={css({ display: 'flex', flexDir: 'column', gap: '1.5', px: '2', py: '2', borderTopWidth: '1px', borderColor: 'border.subtle' })}>
      {rows.map(row => (
        <li key={row.label} className={css({ display: 'flex', flexDir: 'column', gap: '1' })}>
          <span className={css({ display: 'flex', alignItems: 'center', gap: '2', fontSize: 'xs', color: 'fg.muted' })}>
            <span className={css({ display: 'inline-flex', justifyContent: 'center', w: '3.5' })}><Dot tone={row.tone} /></span>
            <span className={css({ flex: '1', minW: '0' })}>{row.label}</span>
            {row.url && (
              <button type="button" aria-label={`Open ${row.label.toLowerCase()} in GitLab`} onClick={() => openExternal(row.url!)} className={css({ color: 'fg.subtle', cursor: 'pointer', _hover: { color: 'fg.default' } })}>
                <ExternalLink className={iconSize} />
              </button>
            )}
          </span>
          {row.children}
        </li>
      ))}
    </ul>
  )
}

interface MergeButtonsProps {
  status: MergeStatus
  summary: MergeSummary
  actions: ReturnType<typeof useMergeActions>
}

function MergeButtons({ status, summary, actions }: MergeButtonsProps) {
  const { merge, cancelAutoMerge } = actions
  const [confirming, setConfirming] = useState(false)
  const busy = merge.isPending || cancelAutoMerge.isPending

  if (summary.action === 'cancel-auto-merge') {
    return (
      <Button size="xs" variant="ghost" disabled={busy} onClick={() => cancelAutoMerge.mutate()}>
        Cancel auto-merge
      </Button>
    )
  }
  if (!summary.action)
    return null
  const autoMerge = summary.action === 'auto-merge'
  if (!confirming) {
    return (
      <Button size="xs" variant={autoMerge ? 'outline' : 'success'} disabled={busy} onClick={() => setConfirming(true)}>
        <GitMerge />
        {autoMerge ? 'Merge when pipeline passes' : 'Merge'}
      </Button>
    )
  }
  return (
    <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', fontSize: 'xs' })}>
      <span className={css({ color: 'fg.muted' })}>{`Into ${status.targetBranch}?`}</span>
      <Button size="xs" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
      <Button
        size="xs"
        variant="success"
        disabled={busy}
        onClick={() => merge.mutate({ sha: status.headSha, autoMerge }, { onSettled: () => setConfirming(false) })}
      >
        {busy ? <Loader2 className={css({ animation: 'spin' })} /> : <GitMerge />}
        {autoMerge ? 'Set auto-merge' : 'Merge'}
      </Button>
    </span>
  )
}

function shownSummary(summary: MergeSummary, flow: ShipFlow, merging: boolean): MergeSummary {
  if (merging)
    return { tone: 'work', label: 'Merging', action: null }
  const run = flow.run
  if (!run || run.stage === 'done')
    return summary
  const tone: MergeTone = run.error ? 'fail' : run.stage === 'review' ? 'idle' : 'work'
  return { tone, label: shipChipLabel(run), action: null }
}

function ShipButton({ files, unpushed, onClick }: { files: LocalChangedFile[], unpushed: UnpushedCommit[], onClick: () => void }) {
  const stat = diffStat(files)
  return (
    <Button size="xs" variant="solid" onClick={onClick}>
      <Upload />
      {files.length ? 'Commit and push' : unpushed.length === 1 ? 'Push 1 commit' : `Push ${unpushed.length} commits`}
      {files.length > 0 && (
        <span className={css({ display: 'inline-flex', gap: '1', fontVariantNumeric: 'tabular-nums', opacity: 0.9 })}>
          <span>{`+${stat.additions}`}</span>
          <span>{`−${stat.deletions}`}</span>
        </span>
      )}
    </Button>
  )
}

export function MergeStatusBar({ mrRef, repoPath }: { mrRef: MrRef, repoPath: string | null }) {
  const query = useMergeStatus(mrRef)
  const actions = useMergeActions(mrRef)
  const { merge, cancelAutoMerge } = actions
  const [open, setOpen] = useState(false)
  const { mergeRequest } = useReview()
  const local = useLocalChanges(mrRef, repoPath, mergeRequest.diffRefs.headSha, mergeRequest.sourceBranch).data
  const belongs = local?.workspace?.belongs !== false
  const files = belongs ? local?.files ?? [] : []
  const unpushed = belongs ? local?.unpushed ?? [] : []
  const flow = useShipFlow(mrRef, repoPath)
  const status = query.data
  if (!status)
    return null
  const summary = summarizeMergeStatus(status)
  const shown = shownSummary(summary, flow, merge.isPending)
  const error = merge.error ?? cancelAutoMerge.error ?? query.error
  const shipping = flow.run !== null && flow.run.stage !== 'done' && !flow.run.error

  return (
    <div className={css({ mb: '2', bg: 'bg.surface', borderWidth: '1px', borderColor: 'border.default', borderRadius: 'lg' })}>
      <div className={css({ display: 'flex', alignItems: 'center', gap: '2', minH: '9', pl: '1', pr: '1.5' })}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={css({ display: 'inline-flex', alignItems: 'center', gap: '1.5', h: '7', px: '1.5', borderRadius: 'md', fontSize: 'xs', fontWeight: 'medium', cursor: 'pointer', _hover: { bg: 'bg.muted' } })}
        >
          <Dot tone={shown.tone} />
          <span className={css({ color: 'fg.muted', fontVariantNumeric: 'tabular-nums' })}>{mrReference(mrRef.iid)}</span>
          <span className={TONE_COLOR[shown.tone]}>{shown.label}</span>
          <ChevronDown className={cx(iconSize, css({ color: 'fg.subtle', transition: 'transform 0.15s' }), open && css({ transform: 'rotate(180deg)' }))} />
        </button>
        <span className={css({ flex: '1' })} />
        {!shipping && (files.length > 0 || unpushed.length > 0)
          ? <ShipButton files={files} unpushed={unpushed} onClick={() => void flow.start(files, unpushed)} />
          : !shipping && <MergeButtons status={status} summary={summary} actions={actions} />}
      </div>
      {error && <p className={css({ px: '2.5', pb: '2', fontSize: 'xs', color: 'danger.fg' })}>{error.message}</p>}
      <ShipCard mrRef={mrRef} branch={mergeRequest.sourceBranch} flow={flow} />
      {open && <Checks mrRef={mrRef} status={status} />}
    </div>
  )
}
