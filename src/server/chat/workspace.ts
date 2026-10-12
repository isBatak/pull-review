import type { MrRef } from '../../shared/types'
import type { LocalHost } from '../local/host'
import { createGitTools } from '../local/git'

const CHECKOUT_TIMEOUT_MS = 10 * 60_000

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

export function createWorkspaces(host: LocalHost): Workspaces {
  const { git, gitOk, openRepository, ensureCommit } = createGitTools(host)

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
      const repo = await openRepository(rawRepoPath, ref)
      const dir = `${root(host.pid)}/worktrees/${slugFor(ref)}`
      await ensureCommit(repo, ref, headSha)
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
      await gitOk(['worktree', 'add', '--quiet', '--detach', '--force', dir, headSha], repo.path, CHECKOUT_TIMEOUT_MS)
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
