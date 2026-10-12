import type { MrRef } from '../../shared/types'
import type { LocalHost } from './host'
import { parseGitRemote } from '../../shared/git-remote'
import { findExecutable, lastLines } from './host'

const GIT_TIMEOUT_MS = 30_000
const FETCH_TIMEOUT_MS = 5 * 60_000

export class GitError extends Error {}

export function expandHome(path: string, homeDir: string) {
  const trimmed = path.trim().replace(/\/+$/, '')
  if (trimmed === '~')
    return homeDir
  return trimmed.startsWith('~/') ? `${homeDir}${trimmed.slice(1)}` : trimmed
}

export function findMatchingRemote(remoteUrls: string, project: string): string | null {
  for (const line of remoteUrls.split('\n')) {
    const match = /^remote\.(.+)\.url\s+(\S+)$/.exec(line.trim())
    if (!match)
      continue
    const [, name, url] = match as unknown as [string, string, string]
    const remote = parseGitRemote(url)
    if (remote && remote.project.toLowerCase() === project.toLowerCase())
      return name
  }
  return null
}

export interface LocalRepository {
  path: string
  remote: string
}

export type GitTools = ReturnType<typeof createGitTools>

export function createGitTools(host: LocalHost) {
  const gitPath = findExecutable(host, 'git')

  async function git(args: string[], cwd: string, timeoutMs = GIT_TIMEOUT_MS) {
    const binary = await gitPath
    if (!binary)
      throw new GitError('Git is not installed.')
    const env = { ...await host.env(), GIT_TERMINAL_PROMPT: '0' }
    return host.run([binary, ...args], { cwd, env, timeoutMs })
  }

  async function gitOk(args: string[], cwd: string, timeoutMs?: number) {
    const result = await git(args, cwd, timeoutMs)
    if (result.code !== 0)
      throw new GitError(lastLines(result.stderr) || `git ${args[0]} failed with code ${result.code}.`)
    return result.stdout.trim()
  }

  async function hasCommit(repoPath: string, sha: string) {
    return (await git(['cat-file', '-e', `${sha}^{commit}`], repoPath)).code === 0
  }

  async function openRepository(rawPath: string, ref: Pick<MrRef, 'project'>): Promise<LocalRepository> {
    const path = expandHome(rawPath, host.homeDir)
    if (!path.startsWith('/'))
      throw new GitError('Use the full path of the folder, for example ~/code/project.')
    if (!await host.exists(path))
      throw new GitError(`The folder ${path} does not exist.`)
    if ((await git(['rev-parse', '--git-dir'], path)).code !== 0)
      throw new GitError(`${path} is not a git repository.`)
    const remotes = await git(['config', '--get-regexp', '^remote\\..*\\.url$'], path)
    const remote = findMatchingRemote(remotes.stdout, ref.project)
    if (!remote)
      throw new GitError(`${path} has no git remote for ${ref.project}.`)
    return { path, remote }
  }

  async function ensureCommit(repo: LocalRepository, ref: MrRef, sha: string) {
    if (await hasCommit(repo.path, sha))
      return
    await git(['fetch', '--no-tags', '--quiet', repo.remote, `refs/merge-requests/${ref.iid}/head`], repo.path, FETCH_TIMEOUT_MS)
    if (await hasCommit(repo.path, sha))
      return
    await gitOk(['fetch', '--no-tags', '--quiet', repo.remote, sha], repo.path, FETCH_TIMEOUT_MS)
  }

  return { git, gitOk, openRepository, ensureCommit }
}
