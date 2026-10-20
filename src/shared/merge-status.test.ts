import type { MergeStatus, PipelineJob } from './types'
import { describe, expect, it } from 'vitest'
import { mrReference, summarizeJobs, summarizeMergeStatus } from './merge-status'

function status(overrides: Partial<MergeStatus> = {}): MergeStatus {
  return {
    state: 'opened',
    draft: false,
    detailedStatus: 'mergeable',
    hasConflicts: false,
    headSha: 'abc',
    targetBranch: 'main',
    autoMerge: false,
    canMerge: true,
    mergeError: null,
    pipeline: null,
    ...overrides,
  }
}

function job(overrides: Partial<PipelineJob>): PipelineJob {
  return { id: 1, name: 'test', stage: 'test', status: 'success', webUrl: '', allowFailure: false, ...overrides }
}

describe('summarizeMergeStatus', () => {
  it('offers a merge when GitLab says the MR is mergeable', () => {
    expect(summarizeMergeStatus(status())).toEqual({ tone: 'ok', label: 'Ready to merge', action: 'merge' })
  })

  it('hides merge actions from people who cannot merge', () => {
    expect(summarizeMergeStatus(status({ canMerge: false })).action).toBeNull()
    expect(summarizeMergeStatus(status({ canMerge: false, detailedStatus: 'ci_still_running' })).action).toBeNull()
  })

  it('offers auto-merge while the pipeline runs and a cancel once it is set', () => {
    expect(summarizeMergeStatus(status({ detailedStatus: 'ci_still_running' }))).toEqual({ tone: 'work', label: 'Pipeline running', action: 'auto-merge' })
    expect(summarizeMergeStatus(status({ detailedStatus: 'ci_still_running', autoMerge: true })).action).toBe('cancel-auto-merge')
  })

  it('puts the MR state ahead of the merge status', () => {
    expect(summarizeMergeStatus(status({ state: 'merged', detailedStatus: 'not_open' }))).toEqual({ tone: 'done', label: 'Merged', action: null })
    expect(summarizeMergeStatus(status({ state: 'closed', detailedStatus: 'not_open' })).label).toBe('Closed')
  })

  it('tells a failed pipeline apart from one that has not passed yet', () => {
    const failed = { id: 1, status: 'failed', webUrl: '', jobs: [] }
    expect(summarizeMergeStatus(status({ detailedStatus: 'ci_must_pass', pipeline: failed })).tone).toBe('fail')
    expect(summarizeMergeStatus(status({ detailedStatus: 'ci_must_pass' })).label).toBe('Pipeline must pass')
  })

  it('names known blockers and falls back for the rest', () => {
    expect(summarizeMergeStatus(status({ detailedStatus: 'conflict', hasConflicts: true })).label).toBe('Conflicts')
    expect(summarizeMergeStatus(status({ detailedStatus: 'checking' })).tone).toBe('work')
    expect(summarizeMergeStatus(status({ detailedStatus: 'locked_paths' }))).toEqual({ tone: 'warn', label: 'Blocked', action: null })
    expect(summarizeMergeStatus(status({ detailedStatus: 'locked_paths', hasConflicts: true })).label).toBe('Conflicts')
  })
})

describe('summarizeJobs', () => {
  it('counts finished and running jobs and ignores failures that are allowed', () => {
    const summary = summarizeJobs([
      job({ id: 1, status: 'success' }),
      job({ id: 2, status: 'running' }),
      job({ id: 3, status: 'failed' }),
      job({ id: 4, status: 'failed', allowFailure: true }),
    ])
    expect(summary).toMatchObject({ total: 4, done: 3, running: 1 })
    expect(summary.failed.map(item => item.id)).toEqual([3])
  })
})

describe('mrReference', () => {
  it('uses the GitLab merge request sign', () => {
    expect(mrReference(128)).toBe('!128')
  })
})
