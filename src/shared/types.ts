export interface MrRef {
  host: string
  project: string
  iid: number
}

export interface User {
  id: number
  username: string
  name: string
  avatarUrl: string | null
  webUrl: string
}

export interface DiffRefs {
  baseSha: string
  headSha: string
  startSha: string
}

export type MrState = 'opened' | 'closed' | 'merged' | 'locked'

export interface MergeRequest {
  ref: MrRef
  title: string
  description: string
  state: MrState
  draft: boolean
  webUrl: string
  author: User
  sourceBranch: string
  targetBranch: string
  createdAt: string
  updatedAt: string
  diffRefs: DiffRefs
  labels: string[]
  reviewers: User[]
}

export type FileStatus = 'added' | 'removed' | 'modified' | 'renamed'

export interface DiffFile {
  id: string
  path: string
  previousPath: string | null
  status: FileStatus
  diff: string
  additions: number
  deletions: number
  isBinary: boolean
  tooLarge: boolean
  generated: boolean
  aMode: string
  bMode: string
}

export type DiffSide = 'additions' | 'deletions'

export interface NotePosition {
  oldPath: string
  newPath: string
  oldLine: number | null
  newLine: number | null
  headSha: string
  side: DiffSide
  line: number
}

export interface Note {
  id: number
  body: string
  author: User
  createdAt: string
  updatedAt: string
  system: boolean
  resolvable: boolean
  resolved: boolean
  resolvedBy: User | null
  position: NotePosition | null
}

export interface Discussion {
  id: string
  individualNote: boolean
  resolvable: boolean
  resolved: boolean
  notes: Note[]
  position: NotePosition | null
}

export interface Approvals {
  approved: boolean
  approvalsRequired: number
  approvalsLeft: number
  approvedBy: User[]
  userHasApproved: boolean
  userCanApprove: boolean
}

export interface PipelineJob {
  id: number
  name: string
  stage: string
  status: string
  webUrl: string
  allowFailure: boolean
}

export interface MergePipeline {
  id: number
  status: string
  webUrl: string
  jobs: PipelineJob[]
}

export interface MergeStatus {
  state: MrState
  draft: boolean
  detailedStatus: string
  hasConflicts: boolean
  headSha: string
  targetBranch: string
  autoMerge: boolean
  canMerge: boolean
  mergeError: string | null
  pipeline: MergePipeline | null
}

export interface MrPayload {
  mergeRequest: MergeRequest
  files: DiffFile[]
  viewer: User
}

export interface DiffLinePosition {
  oldLine: number | null
  newLine: number | null
}

export interface NewDiffComment extends DiffLinePosition {
  oldPath: string
  newPath: string
  range?: { start: DiffLinePosition, end: DiffLinePosition }
}

export interface FileContentsPair {
  oldContents: string | null
  newContents: string | null
}

export interface ProjectRef {
  host: string
  project: string
}

export interface ProjectInfo {
  ref: ProjectRef
  id: number
  name: string
  pathWithNamespace: string
  defaultBranch: string
  webUrl: string
  avatarUrl: string | null
}

export type MrListState = 'opened' | 'merged' | 'closed' | 'all'

export interface MrSummary {
  iid: number
  title: string
  draft: boolean
  state: MrState
  webUrl: string
  author: User
  reviewers: User[]
  sourceBranch: string
  targetBranch: string
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  closedAt: string | null
  userNotesCount: number
  detailedMergeStatus: string
  hasConflicts: boolean
  labels: string[]
}

export interface MrApproval {
  iid: number
  approved: boolean
  approvedBy: User[]
}

export interface MrListResponse {
  items: MrSummary[]
  hasMore: boolean
}

export type MrCounts = Record<MrListState, number | null>

export interface BundleSettings {
  jobName: string
  analysisPath: string
  modulesPath: string
  baseBranch: string
  budgetBytes: number
  thresholdBytes: number
}

export interface BundleArtifactSide {
  jobId: number
  jobUrl: string
  pipelineId: number
  sha: string
  ref: string
  finishedAt: string | null
  analysis: unknown | null
  modules: unknown | null
}

export interface BundleArtifacts {
  current: BundleArtifactSide | null
  base: BundleArtifactSide | null
  headSha: string
  latestJob: { status: string, webUrl: string } | null
}
