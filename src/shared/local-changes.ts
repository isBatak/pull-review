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
}
