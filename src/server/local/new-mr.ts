import type { BranchStatus, MrDraftPromptInput } from '../../shared/new-mr'
import type { ProjectRef } from '../../shared/types'
import type { GitTools, LocalRepository } from './git'
import { parseBranchLog } from '../../shared/new-mr'
import { GitError } from './git'
import { lastLines } from './host'

const FETCH_TIMEOUT_MS = 2 * 60_000
const PUSH_TIMEOUT_MS = 5 * 60_000
const MAX_COMMITS = 50

async function currentBranch(gitTools: GitTools, repo: LocalRepository) {
  const result = await gitTools.git(['symbolic-ref', '--quiet', '--short', 'HEAD'], repo.path)
  return result.code === 0 ? result.stdout.trim() : null
}

async function fetchTarget(gitTools: GitTools, repo: LocalRepository, target: string) {
  const targetRef = `refs/remotes/${repo.remote}/${target}`
  await gitTools.gitOk(['fetch', '--no-tags', '--quiet', repo.remote, `+refs/heads/${target}:${targetRef}`], repo.path, FETCH_TIMEOUT_MS)
  return targetRef
}

async function branchLog(gitTools: GitTools, repo: LocalRepository, targetRef: string) {
  const log = await gitTools.gitOk(['log', '--reverse', `--max-count=${MAX_COMMITS}`, '--format=%H%x1f%s%x1f%b%x1e', `${targetRef}..HEAD`], repo.path)
  return parseBranchLog(log)
}

export async function readBranchStatus(gitTools: GitTools, ref: ProjectRef, rawRepoPath: string, target: string): Promise<BranchStatus | null> {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  const branch = await currentBranch(gitTools, repo)
  if (!branch || branch === target)
    return null
  const targetRef = await fetchTarget(gitTools, repo, target)
  const ahead = Number(await gitTools.gitOk(['rev-list', '--count', `${targetRef}..HEAD`], repo.path)) || 0
  if (!ahead)
    return null
  const status = await gitTools.gitOk(['status', '--porcelain'], repo.path)
  const commits = await branchLog(gitTools, repo, targetRef)
  return {
    path: repo.path,
    branch,
    head: await gitTools.gitOk(['rev-parse', 'HEAD'], repo.path),
    target,
    ahead,
    uncommitted: status ? status.split('\n').length : 0,
    commits: commits.map(commit => ({ sha: commit.sha, subject: commit.subject })),
  }
}

export async function readDraftInput(gitTools: GitTools, ref: ProjectRef, rawRepoPath: string, target: string): Promise<Omit<MrDraftPromptInput, 'recentTitles'>> {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  const branch = await currentBranch(gitTools, repo)
  if (!branch)
    throw new GitError(`${repo.path} is not on a branch.`)
  const targetRef = await fetchTarget(gitTools, repo, target)
  const commits = await branchLog(gitTools, repo, targetRef)
  const diffStat = await gitTools.gitOk(['diff', '--stat=120', `${targetRef}...HEAD`], repo.path)
  return { branch, target, commits: commits.map(({ subject, body }) => ({ subject, body })), diffStat }
}

export async function pushBranch(gitTools: GitTools, ref: ProjectRef, rawRepoPath: string, expectedBranch: string) {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  const branch = await currentBranch(gitTools, repo)
  if (branch !== expectedBranch)
    throw new GitError(`${repo.path} is now on ${branch ?? 'no branch'}, not ${expectedBranch}. Nothing was pushed.`)
  const result = await gitTools.git(['push', '--porcelain', repo.remote, `HEAD:refs/heads/${branch}`], repo.path, PUSH_TIMEOUT_MS)
  if (result.code === 0)
    return
  if (/\[rejected\]|non-fast-forward|fetch first/.test(`${result.stdout}${result.stderr}`))
    throw new GitError(`GitLab has other commits on ${branch}. Nothing was overwritten. Pull them first, then try again.`)
  throw new GitError(lastLines(`${result.stdout}\n${result.stderr}`, 15) || `git push failed with code ${result.code}.`)
}
