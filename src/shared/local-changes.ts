import type { MrRef } from './types'

export interface LocalChangedFile {
  path: string
  previousPath: string | null
  status: 'added' | 'modified' | 'removed' | 'renamed'
  untracked: boolean
  additions: number
  deletions: number
  isBinary: boolean
  diff: string
}

export interface UnpushedCommit {
  sha: string
  subject: string
}

export interface LocalChanges {
  path: string
  files: LocalChangedFile[]
  unpushed: UnpushedCommit[]
  truncated: boolean
  changedSinceHead: ChangedRanges | null
  workspace?: LocalWorkspace
}

export interface LocalWorkspace {
  branch: string | null
  head: string | null
  belongs: boolean
  changedFiles: number
  changedPaths: string[]
  owner: MrRef | null
  ownerTitle?: string | null
}

export function workspaceBelongs(input: { branch: string | null, mrBranch: string, containsMrHead: boolean }) {
  return input.branch === input.mrBranch || (input.branch === null && input.containsMrHead)
}

export function describeWorkspace(workspace: Pick<LocalWorkspace, 'branch' | 'head'>) {
  return workspace.branch ? `branch ${workspace.branch}` : `commit ${workspace.head?.slice(0, 8) ?? 'unknown'}`
}

export type ChangedRanges = Record<string, [number, number][]>

const ZERO_CONTEXT_HUNK = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/

export function parseChangedRanges(patch: string): ChangedRanges {
  const ranges: ChangedRanges = {}
  let current: [number, number][] | null = null
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = null
      continue
    }
    if (line.startsWith('--- ')) {
      const path = line.slice(4).trim()
      current = path === '/dev/null' ? null : (ranges[path.replace(/^a\//, '')] ??= [])
      continue
    }
    const hunk = ZERO_CONTEXT_HUNK.exec(line)
    if (!hunk || !current)
      continue
    const start = Number(hunk[1])
    const length = hunk[2] === undefined ? 1 : Number(hunk[2])
    current.push(length === 0 ? [start, start + 1] : [start, start + length - 1])
  }
  return ranges
}

export function hasLocalChanges(ranges: ChangedRanges | null | undefined, paths: string[]) {
  return paths.some(path => (ranges?.[path]?.length ?? 0) > 0)
}

export const MAX_LOCAL_FIXES = 50

export interface LocalFix {
  discussionIds: string[]
  findingIds: string[]
  paths: string[]
  appliedAt: number
  manual?: boolean
}

export interface FixTarget {
  discussionId?: string
  findingId?: string
}

function matches(fix: LocalFix, target: FixTarget) {
  return Boolean((target.discussionId && fix.discussionIds.includes(target.discussionId)) || (target.findingId && fix.findingIds.includes(target.findingId)))
}

export function fixFor(fixes: LocalFix[], target: FixTarget) {
  return fixes.findLast(fix => matches(fix, target)) ?? null
}

export function withFix(fixes: LocalFix[], fix: LocalFix) {
  if (!fix.discussionIds.length && !fix.findingIds.length)
    return fixes
  return [...fixes, fix].slice(-MAX_LOCAL_FIXES)
}

export function withoutFix(fixes: LocalFix[], target: FixTarget) {
  return fixes
    .map(fix => ({
      ...fix,
      discussionIds: fix.discussionIds.filter(id => id !== target.discussionId),
      findingIds: fix.findingIds.filter(id => id !== target.findingId),
    }))
    .filter(fix => fix.discussionIds.length || fix.findingIds.length)
}

function stringList(value: unknown, limit: number) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 1024).slice(0, limit) : []
}

export function readLocalFix(value: unknown): LocalFix | null {
  if (typeof value !== 'object' || value === null)
    return null
  const raw = value as Partial<LocalFix>
  const fix: LocalFix = {
    discussionIds: stringList(raw.discussionIds, 100),
    findingIds: stringList(raw.findingIds, 100),
    paths: stringList(raw.paths, 200),
    appliedAt: typeof raw.appliedAt === 'number' ? raw.appliedAt : Date.now(),
    ...(raw.manual === true ? { manual: true } : {}),
  }
  return fix.discussionIds.length || fix.findingIds.length ? fix : null
}

export interface CommitDetails {
  sha: string
  message: string
  files: { path: string, diff: string, isBinary: boolean }[]
}
