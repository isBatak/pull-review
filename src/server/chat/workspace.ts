import type { MrRef } from '../../shared/types'
import type { ChatHost } from './host'
import { parseGitRemote } from '../../shared/git-remote'
import { findExecutable, lastLines } from './host'

const GIT_TIMEOUT_MS = 30_000
const FETCH_TIMEOUT_MS = 5 * 60_000
const CHECKOUT_TIMEOUT_MS = 10 * 60_000

export class WorkspaceError extends Error {}

export interface Workspaces {
  rootFor: (pid: number) => string
  contextDir: (ref: MrRef) => string
  worktreeDir: (ref: MrRef) => string
  prepare: (ref: MrRef, repoPath: string, headSha: string) => Promise<string>
  removeWorktree: (dir: string) => Promise<void>
  sweepStale: () => Promise<void>
  removeAll: () => Promise<void>
}

export function slugFor(ref: MrRef) {
  return `${ref.host}-${ref.project}-${ref.iid}`.replace(/[^\w.-]+/g, '-')
}

export function expandHome(path: string, homeDir: string) {
  const trimmed = path.trim().replace(/\/+$/, '')
  if (trimmed === '~')
    return homeDir
  return trimmed.startsWith('~/') ? `${homeDir}${trimmed.slice(1)}` : trimmed
}

export function findMatchingRemote(remoteOutput: string, project: string): string | null {
  for (const line of remoteOutput.split('\n')) {
    const [name, url] = line.trim().split(/\s+/)
    if (!name || !url)
      continue
    const remote = parseGitRemote(url)
    if (remote && remote.project.toLowerCase() === project.toLowerCase())
      return name
  }
  return null
}

export function createWorkspaces(host: ChatHost): Workspaces {
  const gitPath = findExecutable(host, 'git')

  async function git(args: string[], cwd: string, timeoutMs = GIT_TIMEOUT_MS) {
    const binary = await gitPath
    if (!binary)
      throw new WorkspaceError('Git is not installed.')
    const env = { ...await host.env(), GIT_TERMINAL_PROMPT: '0' }
    return host.run([binary, ...args], { cwd, env, timeoutMs })
  }

  async function gitOk(args: string[], cwd: string, timeoutMs?: number) {
    const result = await git(args, cwd, timeoutMs)
    if (result.code !== 0)
      throw new WorkspaceError(lastLines(result.stderr) || `git ${args[0]} failed with code ${result.code}.`)
    return result.stdout.trim()
  }

  async function hasCommit(repoPath: string, sha: string) {
    return (await git(['cat-file', '-e', `${sha}^{commit}`], repoPath)).code === 0
  }

  async function ensureCommit(repoPath: string, remote: string, ref: MrRef, sha: string) {
    if (await hasCommit(repoPath, sha))
      return
    await git(['fetch', '--no-tags', '--quiet', remote, `refs/merge-requests/${ref.iid}/head`], repoPath, FETCH_TIMEOUT_MS)
    if (await hasCommit(repoPath, sha))
      return
    await gitOk(['fetch', '--no-tags', '--quiet', remote, sha], repoPath, FETCH_TIMEOUT_MS)
  }

  async function checkRepository(repoPath: string, ref: MrRef) {
    if (!repoPath.startsWith('/'))
      throw new WorkspaceError('Use the full path of the folder, for example ~/code/project.')
    if (!await host.exists(repoPath))
      throw new WorkspaceError(`The folder ${repoPath} does not exist.`)
    const remotes = await git(['remote', '-v'], repoPath)
    if (remotes.code !== 0)
      throw new WorkspaceError(`${repoPath} is not a git repository.`)
    const remote = findMatchingRemote(remotes.stdout, ref.project)
    if (!remote)
      throw new WorkspaceError(`${repoPath} has no git remote for ${ref.project}.`)
    return remote
  }

  const root = (pid: number) => `${host.cacheDir}/${pid}`

  async function removeWorktree(dir: string) {
    const commonDir = await git(['rev-parse', '--path-format=absolute', '--git-common-dir'], dir).catch(() => null)
    await host.remove(dir)
    const gitDir = commonDir?.code === 0 ? commonDir.stdout.trim() : null
    if (gitDir)
      await git([`--git-dir=${gitDir}`, 'worktree', 'prune'], host.homeDir).catch(() => null)
  }

  async function removeRoot(pid: number) {
    const worktrees = `${root(pid)}/worktrees`
    for (const name of await host.listDir(worktrees))
      await removeWorktree(`${worktrees}/${name}`)
    await host.remove(root(pid))
  }

  return {
    rootFor: root,
    contextDir: ref => `${root(host.pid)}/context/${slugFor(ref)}`,
    worktreeDir: ref => `${root(host.pid)}/worktrees/${slugFor(ref)}`,

    async prepare(ref, rawRepoPath, headSha) {
      const repoPath = expandHome(rawRepoPath, host.homeDir)
      const remote = await checkRepository(repoPath, ref)
      const dir = `${root(host.pid)}/worktrees/${slugFor(ref)}`
      await ensureCommit(repoPath, remote, ref, headSha)
      if (await host.exists(dir)) {
        const current = await git(['rev-parse', 'HEAD'], dir)
        if (current.code === 0 && current.stdout.trim() === headSha)
          return dir
        if (current.code === 0) {
          await gitOk(['checkout', '--quiet', '--detach', '--force', headSha], dir, CHECKOUT_TIMEOUT_MS)
          return dir
        }
        await removeWorktree(dir)
      }
      await host.makeDir(`${root(host.pid)}/worktrees`)
      await gitOk(['worktree', 'add', '--quiet', '--detach', '--force', dir, headSha], repoPath, CHECKOUT_TIMEOUT_MS)
      return dir
    },

    removeWorktree,

    removeAll: () => removeRoot(host.pid),

    async sweepStale() {
      for (const name of await host.listDir(host.cacheDir)) {
        const pid = Number(name)
        if (!Number.isInteger(pid) || pid === host.pid)
          continue
        if (!await host.isProcessAlive(pid))
          await removeRoot(pid).catch(() => null)
      }
    },
  }
}
