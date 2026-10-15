import type { CommitResult, MadeCommit, PlannedCommit } from '../../shared/commit-plan'
import type { MrRef } from '../../shared/types'
import type { GitTools, LocalRepository } from './git'
import { validateCommits } from '../../shared/commit-plan'
import { readStatus } from './changes'
import { GitError } from './git'
import { lastLines } from './host'

const COMMIT_TIMEOUT_MS = 5 * 60_000
const PUSH_TIMEOUT_MS = 5 * 60_000
const MAX_UNPUSHED = 50

export interface MrBranch {
  branch: string
  headSha: string
}

async function head(gitTools: GitTools, path: string) {
  return (await gitTools.gitOk(['rev-parse', 'HEAD'], path)).trim()
}

async function containsMrHead(gitTools: GitTools, path: string, headSha: string) {
  return (await gitTools.git(['merge-base', '--is-ancestor', headSha, 'HEAD'], path)).code === 0
}

export async function readUnpushed(gitTools: GitTools, path: string, headSha: string): Promise<MadeCommit[]> {
  if (!/^[0-9a-f]{7,64}$/i.test(headSha) || !await containsMrHead(gitTools, path, headSha))
    return []
  const log = await gitTools.git(['log', `--max-count=${MAX_UNPUSHED}`, '--format=%H%x09%s', `${headSha}..HEAD`], path)
  return log.stdout.split('\n').filter(Boolean).map((line) => {
    const [sha, ...subject] = line.split('\t')
    return { sha: sha!, subject: subject.join('\t') }
  })
}

async function ensureOnMergeRequest(gitTools: GitTools, repo: LocalRepository, mr: MrBranch) {
  if (await head(gitTools, repo.path) === mr.headSha || await containsMrHead(gitTools, repo.path, mr.headSha))
    return
  throw new GitError(`${repo.path} is not on this merge request's latest commit (${mr.headSha.slice(0, 8)}), so committing here would not update the merge request. Reload the merge request to switch it.`)
}

function failureText(result: { stdout: string, stderr: string }) {
  return lastLines(`${result.stdout}\n${result.stderr}`, 15)
}

export async function pushToMergeRequest(gitTools: GitTools, repo: LocalRepository, mr: MrBranch) {
  const result = await gitTools.git(['push', '--porcelain', repo.remote, `HEAD:refs/heads/${mr.branch}`], repo.path, PUSH_TIMEOUT_MS)
  if (result.code === 0)
    return null
  if (/\[rejected\]|non-fast-forward|fetch first/.test(`${result.stdout}${result.stderr}`))
    return `GitLab has newer commits on ${mr.branch} than this folder. Nothing was overwritten. Reload the merge request, then push again.`
  return failureText(result) || `git push failed with code ${result.code}.`
}

export async function commitLocalChanges(
  gitTools: GitTools,
  ref: MrRef,
  rawRepoPath: string,
  mr: MrBranch,
  input: { commits: PlannedCommit[], push: boolean, skipHooks: boolean },
): Promise<CommitResult> {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  await ensureOnMergeRequest(gitTools, repo, mr)
  const entries = await readStatus(gitTools, repo.path)
  const problem = validateCommits(input.commits, entries.map(entry => entry.path))
  if (problem)
    throw new GitError(problem)
  const previousPaths = new Map(entries.filter(entry => entry.previousPath).map(entry => [entry.path, entry.previousPath!]))

  await gitTools.gitOk(['reset', '--quiet'], repo.path)
  const made: MadeCommit[] = []
  for (const commit of input.commits) {
    const paths = commit.files.flatMap(file => previousPaths.has(file) ? [file, previousPaths.get(file)!] : [file])
    await gitTools.gitOk(['add', '--all', '--', ...paths], repo.path)
    const result = await gitTools.git(['commit', '--quiet', ...(input.skipHooks ? ['--no-verify'] : []), '-m', commit.message.trim()], repo.path, COMMIT_TIMEOUT_MS)
    if (result.code !== 0) {
      await gitTools.git(['reset', '--quiet'], repo.path)
      const done = made.length ? ` The first ${made.length} commit${made.length === 1 ? ' was' : 's were'} made and not pushed.` : ''
      throw new GitError(`Commit ${made.length + 1} failed.${done} ${failureText(result)}`)
    }
    made.push({ sha: await head(gitTools, repo.path), subject: commit.message.trim().split('\n')[0]! })
  }
  if (!input.push)
    return { commits: made, pushed: false, pushError: null }
  const pushError = await pushToMergeRequest(gitTools, repo, mr)
  return { commits: made, pushed: pushError === null, pushError }
}

export async function pushLocalCommits(gitTools: GitTools, ref: MrRef, rawRepoPath: string, mr: MrBranch) {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  await ensureOnMergeRequest(gitTools, repo, mr)
  const pushError = await pushToMergeRequest(gitTools, repo, mr)
  if (pushError)
    throw new GitError(pushError)
  return { pushed: true }
}
