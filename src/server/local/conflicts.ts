import type { ConflictReport, ResolvedFile, ResolveFileInput, SyncedFile, SyncStrategy } from '../../shared/conflicts'
import type { MrRef } from '../../shared/types'
import type { MrBranch } from './commits'
import type { GitTools, LocalRepository } from './git'
import type { LocalHost } from './host'
import { conflictHunks, parseMergeTreeNames } from '../../shared/conflicts'
import { pushToMergeRequest } from './commits'
import { GitError } from './git'
import { lastLines } from './host'

const FETCH_TIMEOUT_MS = 5 * 60_000
const APPLY_TIMEOUT_MS = 5 * 60_000
const PUSH_TIMEOUT_MS = 5 * 60_000
const MAX_PREVIEW_FILES = 30
const MAX_REBASE_STOPS = 50
const MAX_FILE_CHARS = 150_000
const MAX_STOP_CHARS = 400_000

export type ResolveStop = (input: { files: ResolveFileInput[], commitSubject: string | null }) => Promise<ResolvedFile[]>

function failureText(result: { stdout: string, stderr: string }) {
  return lastLines(`${result.stdout}\n${result.stderr}`, 15)
}

async function fetchTarget(gitTools: GitTools, repo: LocalRepository, target: string) {
  const targetRef = `refs/remotes/${repo.remote}/${target}`
  await gitTools.gitOk(['fetch', '--no-tags', '--quiet', repo.remote, `+refs/heads/${target}:${targetRef}`], repo.path, FETCH_TIMEOUT_MS)
  return targetRef
}

export async function inspectConflicts(gitTools: GitTools, ref: MrRef, rawRepoPath: string, mr: MrBranch, target: string, strategy: SyncStrategy): Promise<ConflictReport> {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  await gitTools.ensureCommit(repo, ref, mr.headSha)
  const targetRef = await fetchTarget(gitTools, repo, target)
  const behind = Number(await gitTools.gitOk(['rev-list', '--count', `${mr.headSha}..${targetRef}`], repo.path)) || 0
  const result = await gitTools.git(['merge-tree', '--write-tree', '--name-only', '--no-messages', mr.headSha, targetRef], repo.path)
  if (result.code !== 0 && result.code !== 1)
    throw new GitError(failureText(result) || 'git merge-tree failed. It needs git 2.38 or newer.')
  const tree = result.stdout.split('\n')[0]?.trim() ?? ''
  const names = result.code === 1 ? parseMergeTreeNames(result.stdout).slice(0, MAX_PREVIEW_FILES) : []
  const files = await Promise.all(names.map(async (path) => {
    const content = await gitTools.git(['show', `${tree}:${path}`], repo.path)
    return { path, hunks: content.code === 0 ? conflictHunks(content.stdout) : [] }
  }))
  return { target, behind, strategy, files }
}

async function headOf(gitTools: GitTools, path: string) {
  return gitTools.gitOk(['rev-parse', 'HEAD'], path)
}

async function ensureCleanAtHead(gitTools: GitTools, repo: LocalRepository, mr: MrBranch) {
  if (await headOf(gitTools, repo.path) !== mr.headSha)
    throw new GitError(`${repo.path} must be exactly at the merge request's latest commit (${mr.headSha.slice(0, 8)}), with no unpushed commits. Push or reload first.`)
  if (await gitTools.gitOk(['status', '--porcelain'], repo.path))
    throw new GitError(`${repo.path} has uncommitted changes. Commit or discard them first.`)
}

export interface SyncInput {
  mr: MrBranch
  target: string
  strategy: SyncStrategy
  resolve: ResolveStop
  onProgress: (progress: { phase: 'apply' | 'resolve', text: string }) => void
}

export async function syncWithTarget(host: LocalHost, gitTools: GitTools, ref: MrRef, rawRepoPath: string, input: SyncInput) {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  await ensureCleanAtHead(gitTools, repo, input.mr)
  const targetRef = await fetchTarget(gitTools, repo, input.target)
  const resolved = new Map<string, string>()
  const run = (args: string[]) => gitTools.git(args, repo.path, APPLY_TIMEOUT_MS)

  async function resolveStop(stopped: { stdout: string, stderr: string }, commitSubject: string | null) {
    const names = (await gitTools.gitOk(['diff', '--name-only', '--diff-filter=U'], repo.path)).split('\n').filter(Boolean)
    if (!names.length)
      throw new GitError(failureText(stopped) || 'Git stopped without a conflict it can show.')
    let total = 0
    const files = await Promise.all(names.map(async (path) => {
      const content = await host.readFile(`${repo.path}/${path}`)
      if (content === null)
        throw new GitError(`${path} was deleted on one side and changed on the other. Fix this one by hand.`)
      if (content.length > MAX_FILE_CHARS)
        throw new GitError(`${path} is too large to fix here. Fix this one by hand.`)
      total += content.length
      return { path, content }
    }))
    if (total > MAX_STOP_CHARS)
      throw new GitError('The conflicted files are too large to fix here. Fix them by hand.')
    const where = commitSubject ? ` in "${commitSubject}"` : ''
    input.onProgress({ phase: 'resolve', text: `Claude is fixing ${names.length === 1 ? '1 file' : `${names.length} files`}${where}` })
    for (const file of await input.resolve({ files, commitSubject })) {
      await host.writeFile(`${repo.path}/${file.path}`, file.content)
      resolved.set(file.path, file.explanation)
    }
    await gitTools.gitOk(['add', '--', ...names], repo.path)
    input.onProgress({ phase: 'apply', text: input.strategy === 'rebase' ? `Rebasing onto ${input.target}` : `Merging ${input.target}` })
  }

  try {
    input.onProgress({ phase: 'apply', text: input.strategy === 'rebase' ? `Rebasing onto ${input.target}` : `Merging ${input.target}` })
    if (input.strategy === 'merge') {
      const merged = await run(['merge', '--no-ff', '--no-edit', targetRef])
      if (merged.code !== 0) {
        await resolveStop(merged, null)
        const committed = await run(['-c', 'core.editor=true', 'commit', '--no-edit'])
        if (committed.code !== 0)
          throw new GitError(failureText(committed))
      }
    }
    else {
      let step = await run(['rebase', targetRef])
      for (let stops = 0; step.code !== 0; stops++) {
        if (stops >= MAX_REBASE_STOPS)
          throw new GitError('The rebase stopped too many times. Finish it by hand.')
        const subject = (await gitTools.git(['log', '-1', '--format=%s', 'REBASE_HEAD'], repo.path)).stdout.trim() || null
        await resolveStop(step, subject)
        step = await run(['-c', 'core.editor=true', 'rebase', '--continue'])
      }
    }
  }
  catch (error) {
    await gitTools.git([input.strategy === 'rebase' ? 'rebase' : 'merge', '--abort'], repo.path)
    await gitTools.git(['reset', '--hard', '--quiet', input.mr.headSha], repo.path)
    throw error
  }

  const newHead = await headOf(gitTools, repo.path)
  const files: SyncedFile[] = await Promise.all([...resolved].map(async ([path, explanation]) => ({
    path,
    explanation,
    diff: (await gitTools.git(['diff', '--no-color', '--no-ext-diff', targetRef, newHead, '--', path], repo.path)).stdout,
  })))
  return { newHead, files }
}

export async function pushSynced(gitTools: GitTools, ref: MrRef, rawRepoPath: string, mr: MrBranch, job: { strategy: SyncStrategy, oldHead: string, newHead: string }) {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  if (mr.headSha !== job.oldHead)
    throw new GitError(`The merge request has new commits since the fix started. Nothing was pushed. Undo, reload and try again.`)
  if (await headOf(gitTools, repo.path) !== job.newHead)
    throw new GitError(`${repo.path} moved since the fix. Nothing was pushed.`)
  if (job.strategy === 'merge') {
    const pushError = await pushToMergeRequest(gitTools, repo, mr)
    if (pushError)
      throw new GitError(pushError)
    return
  }
  const result = await gitTools.git(['push', '--porcelain', `--force-with-lease=refs/heads/${mr.branch}:${job.oldHead}`, repo.remote, `HEAD:refs/heads/${mr.branch}`], repo.path, PUSH_TIMEOUT_MS)
  if (result.code === 0)
    return
  if (/\[rejected\]|stale info|non-fast-forward/.test(`${result.stdout}${result.stderr}`))
    throw new GitError(`GitLab has newer commits on ${mr.branch}. Nothing was overwritten. Undo, reload and try again.`)
  throw new GitError(failureText(result) || `git push failed with code ${result.code}.`)
}

export async function undoSync(gitTools: GitTools, ref: MrRef, rawRepoPath: string, job: { oldHead: string, newHead: string }) {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  if (await headOf(gitTools, repo.path) !== job.newHead)
    throw new GitError(`${repo.path} moved since the fix, so it was left as it is.`)
  await gitTools.gitOk(['reset', '--hard', '--quiet', job.oldHead], repo.path)
}
