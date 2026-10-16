import type { CommitResult, MadeCommit, PlannedCommit } from '../../shared/commit-plan'
import type { CommitDetails } from '../../shared/local-changes'
import type { MrRef } from '../../shared/types'
import type { GitTools, LocalRepository } from './git'
import type { LocalHost } from './host'
import { hunkPatch, splitInfo, validateCommits } from '../../shared/commit-plan'
import { readLocalChanges, splitPatchByFile } from './changes'
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

export async function readUnpushedCommit(gitTools: GitTools, ref: MrRef, rawRepoPath: string, headSha: string, sha: string): Promise<CommitDetails> {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  if (!(await readUnpushed(gitTools, repo.path, headSha)).some(commit => commit.sha === sha))
    throw new GitError('This commit is not one of the unpushed commits any more. Reload the local changes.')
  const message = (await gitTools.gitOk(['log', '-1', '--format=%B', sha], repo.path)).trim()
  const patch = await gitTools.gitOk(['show', '--format=', '--no-color', '--no-ext-diff', '-M', sha], repo.path)
  return {
    sha,
    message,
    files: [...splitPatchByFile(patch)].map(([path, diff]) => ({ path, diff, isBinary: /^Binary files /m.test(diff) })),
  }
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
  host: LocalHost,
  gitTools: GitTools,
  ref: MrRef,
  rawRepoPath: string,
  mr: MrBranch,
  input: { commits: PlannedCommit[], push: boolean, skipHooks: boolean },
): Promise<CommitResult> {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  await ensureOnMergeRequest(gitTools, repo, mr)
  const changes = await readLocalChanges(gitTools, ref, repo.path)
  if (changes.truncated && input.commits.some(commit => commit.hunks && Object.keys(commit.hunks).length))
    throw new GitError('The local changes are too large to commit in parts. Put each file in one commit as a whole.')
  const problem = validateCommits(input.commits, changes.files.map(splitInfo))
  if (problem)
    throw new GitError(problem)
  const byPath = new Map(changes.files.map(file => [file.path, file]))

  await gitTools.gitOk(['reset', '--quiet'], repo.path)
  const made: MadeCommit[] = []
  const fail = async (detail: string) => {
    await gitTools.git(['reset', '--quiet'], repo.path)
    const done = made.length ? ` The first ${made.length} commit${made.length === 1 ? ' was' : 's were'} made and not pushed.` : ''
    throw new GitError(`Commit ${made.length + 1} failed.${done} ${detail}`)
  }
  for (const commit of input.commits) {
    const whole = commit.files.filter(file => !commit.hunks?.[file])
    const paths = whole.flatMap((file) => {
      const previousPath = byPath.get(file)?.previousPath
      return previousPath ? [file, previousPath] : [file]
    })
    if (paths.length)
      await gitTools.gitOk(['add', '--all', '--', ...paths], repo.path)
    for (const [file, hunks] of Object.entries(commit.hunks ?? {})) {
      const staged = await stagePartOfFile(host, gitTools, repo.path, hunkPatch(byPath.get(file)!.diff, hunks))
      if (staged)
        await fail(`Part of ${file} could not be staged. Reload the local changes and plan again. ${staged}`)
    }
    const result = await gitTools.git(['commit', '--quiet', ...(input.skipHooks ? ['--no-verify'] : []), '-m', commit.message.trim()], repo.path, COMMIT_TIMEOUT_MS)
    if (result.code !== 0)
      await fail(failureText(result))
    made.push({ sha: await head(gitTools, repo.path), subject: commit.message.trim().split('\n')[0]! })
  }
  if (!input.push)
    return { commits: made, pushed: false, pushError: null }
  const pushError = await pushToMergeRequest(gitTools, repo, mr)
  return { commits: made, pushed: pushError === null, pushError }
}

async function stagePartOfFile(host: LocalHost, gitTools: GitTools, repoPath: string, patch: string) {
  const dir = `${host.cacheDir}/patches`
  await host.makeDir(dir)
  const file = `${dir}/${crypto.randomUUID()}.patch`
  await host.writeFile(file, patch)
  try {
    const result = await gitTools.git(['apply', '--cached', '--recount', '--whitespace=nowarn', file], repoPath)
    return result.code === 0 ? null : failureText(result)
  }
  finally {
    await host.remove(file).catch(() => null)
  }
}

export async function pushLocalCommits(gitTools: GitTools, ref: MrRef, rawRepoPath: string, mr: MrBranch) {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  await ensureOnMergeRequest(gitTools, repo, mr)
  const pushError = await pushToMergeRequest(gitTools, repo, mr)
  if (pushError)
    throw new GitError(pushError)
  return { pushed: true }
}
