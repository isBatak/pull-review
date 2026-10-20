import type { MergeStatus, PipelineJob } from './types'

export type MergeTone = 'idle' | 'work' | 'warn' | 'fail' | 'ok' | 'done'

export type MergeAction = 'merge' | 'auto-merge' | 'cancel-auto-merge'

export interface MergeSummary {
  tone: MergeTone
  label: string
  action: MergeAction | null
}

const CHECKING = new Set(['unchecked', 'checking', 'preparing', 'approvals_syncing'])

const BLOCKERS: Record<string, { tone: MergeTone, label: string }> = {
  conflict: { tone: 'warn', label: 'Conflicts' },
  need_rebase: { tone: 'warn', label: 'Needs rebase' },
  not_approved: { tone: 'warn', label: 'Needs approval' },
  requested_changes: { tone: 'warn', label: 'Changes requested' },
  discussions_not_resolved: { tone: 'warn', label: 'Open threads' },
  draft_status: { tone: 'idle', label: 'Draft' },
  not_open: { tone: 'idle', label: 'Not open' },
}

const PIPELINE_FAILED = new Set(['failed', 'canceled'])

export function summarizeMergeStatus(status: MergeStatus): MergeSummary {
  const allowed = (action: MergeAction) => (status.canMerge ? action : null)
  if (status.state === 'merged')
    return { tone: 'done', label: 'Merged', action: null }
  if (status.state === 'closed')
    return { tone: 'idle', label: 'Closed', action: null }
  if (status.state === 'locked')
    return { tone: 'idle', label: 'Locked', action: null }
  if (status.autoMerge)
    return { tone: 'work', label: 'Merges when pipeline passes', action: allowed('cancel-auto-merge') }
  if (status.detailedStatus === 'mergeable')
    return { tone: 'ok', label: 'Ready to merge', action: allowed('merge') }
  if (CHECKING.has(status.detailedStatus))
    return { tone: 'work', label: 'Checking', action: null }
  if (status.detailedStatus === 'ci_still_running')
    return { tone: 'work', label: 'Pipeline running', action: allowed('auto-merge') }
  if (status.detailedStatus === 'ci_must_pass') {
    return status.pipeline && PIPELINE_FAILED.has(status.pipeline.status)
      ? { tone: 'fail', label: 'Pipeline failed', action: null }
      : { tone: 'warn', label: 'Pipeline must pass', action: null }
  }
  const blocker = BLOCKERS[status.detailedStatus]
  if (blocker)
    return { ...blocker, action: null }
  if (status.hasConflicts)
    return { tone: 'warn', label: 'Conflicts', action: null }
  return { tone: 'warn', label: 'Blocked', action: null }
}

const RUNNING_JOB = new Set(['created', 'pending', 'running', 'preparing', 'waiting_for_resource', 'scheduled'])
const DONE_JOB = new Set(['success', 'skipped', 'manual', 'canceled'])

export interface JobSummary {
  total: number
  done: number
  running: number
  failed: PipelineJob[]
}

export function summarizeJobs(jobs: PipelineJob[]): JobSummary {
  const failed = jobs.filter(job => job.status === 'failed' && !job.allowFailure)
  return {
    total: jobs.length,
    done: jobs.filter(job => DONE_JOB.has(job.status) || job.status === 'failed').length,
    running: jobs.filter(job => RUNNING_JOB.has(job.status)).length,
    failed,
  }
}

export function mrReference(iid: number) {
  return `!${iid}`
}
