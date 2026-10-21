import type { LocalCheckout, LocalFolderInfo } from '../../shared/local-repo'
import type { MrRef } from '../../shared/types'
import type { GitTools, LocalRepository } from './git'
import type { LocalHost } from './host'
import { expandHome, GitError } from './git'

const CHECKOUT_TIMEOUT_MS = 10 * 60_000
const FETCH_TIMEOUT_MS = 5 * 60_000

function parentOf(path: string) {
  return path.slice(0, path.lastIndexOf('/')) || '/'
}

function baseName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function worktreeWithBranch(porcelain: string, branch: string, except: string): string | null {
  for (const block of porcelain.split(/\n\s*\n/)) {
    const path = /^worktree (.+)$/m.exec(block)?.[1]
    const checkedOut = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]
    if (path && checkedOut === branch && path !== except)
      return path
  }
  return null
}

export function createRepoLinks(host: LocalHost, tools: GitTools) {
  const { git, gitOk } = tools

  async function revParse(args: string[], cwd: string) {
    const result = await git(['rev-parse', ...args], cwd)
    return result.code === 0 ? result.stdout.trim() : null
  }

  async function isLinkedWorktree(path: string) {
    const [gitDir, commonDir] = await Promise.all([
      revParse(['--path-format=absolute', '--git-dir'], path),
      revParse(['--path-format=absolute', '--git-common-dir'], path),
    ])
    return Boolean(gitDir && commonDir && gitDir !== commonDir)
  }

  async function isDirty(path: string) {
    const status = await gitOk(['status', '--porcelain', '--untracked-files=no'], path)
    return status.length > 0
  }

  async function currentBranch(path: string) {
    const result = await git(['symbolic-ref', '--short', '-q', 'HEAD'], path)
    return result.code === 0 ? result.stdout.trim() : null
  }

  async function open(rawPath: string, ref: Pick<MrRef, 'project'>): Promise<LocalRepository> {
    const repo = await tools.openRepository(rawPath, ref)
    const top = await revParse(['--show-toplevel'], repo.path)
    return top ? { ...repo, path: top } : repo
  }

  async function inspect(rawPath: string, ref: Pick<MrRef, 'project'>): Promise<LocalFolderInfo> {
    const repo = await open(rawPath, ref)
    const linked = await isLinkedWorktree(repo.path)
    const commonDir = await revParse(['--path-format=absolute', '--git-common-dir'], repo.path)
    const mainPath = commonDir?.endsWith('/.git') ? commonDir.slice(0, -'/.git'.length) : repo.path
    return {
      path: repo.path,
      isLinkedWorktree: linked,
      branch: await currentBranch(repo.path),
      dirty: await isDirty(repo.path),
      suggestedWorktreePath: `${parentOf(mainPath)}/${baseName(mainPath)}-review`,
    }
  }

  async function createWorktree(rawSource: string, rawTarget: string, ref: Pick<MrRef, 'project'>) {
    const repo = await open(rawSource, ref)
    const target = expandHome(rawTarget, host.homeDir)
    if (!target.startsWith('/'))
      throw new GitError('Use the full path for the new worktree, for example ~/code/project-review.')
    if (await host.exists(target))
      throw new GitError(`${target} already exists. Choose a folder that does not exist yet.`)
    await gitOk(['worktree', 'add', '--quiet', '--detach', target, 'HEAD'], repo.path, CHECKOUT_TIMEOUT_MS)
    return { path: target }
  }

  async function isAncestor(path: string, older: string, newer: string) {
    return (await git(['merge-base', '--is-ancestor', older, newer], path)).code === 0
  }

  async function detachAt(path: string, sha: string, reason: string, branch: string): Promise<LocalCheckout> {
    await gitOk(['checkout', '--quiet', '--detach', sha], path, CHECKOUT_TIMEOUT_MS)
    return { status: 'detached', path, branch, sha, message: reason }
  }

  async function checkout(rawPath: string, ref: MrRef, branch: string, sha: string): Promise<LocalCheckout> {
    const repo = await open(rawPath, ref)
    const path = repo.path
    if (!await isLinkedWorktree(path)) {
      return {
        status: 'main-checkout',
        path,
        branch,
        sha,
        message: 'This is your main checkout, so Pull Review does not switch its branch. Create a worktree for Pull Review instead.',
      }
    }
    const current = await currentBranch(path)
    const head = await revParse(['HEAD'], path)
    if (current === branch && head === sha)
      return { status: 'ready', path, branch, sha, message: null }
    if (await isDirty(path))
      return { status: 'dirty', path, branch, sha, message: `${path} has uncommitted changes, so it stays on ${current ?? head?.slice(0, 8)}.` }
    if (!current && head && !(await git(['for-each-ref', '--count=1', '--contains', head, '--format=%(refname)', 'refs/heads', 'refs/remotes'], path)).stdout.trim())
      return { status: 'dirty', path, branch, sha, message: `${path} has commits that are not pushed to any branch, so it stays on ${head.slice(0, 8)}. Push or discard them first.` }

    await tools.ensureCommit(repo, ref, sha)
    const validBranch = (await git(['check-ref-format', '--branch', branch], path)).code === 0
    if (!validBranch)
      return detachAt(path, sha, `${branch} is not a valid local branch name, so the merge request's commit is checked out without a branch.`, branch)

    const remoteRef = `refs/remotes/${repo.remote}/${branch}`
    await git(['fetch', '--no-tags', '--quiet', repo.remote, `+refs/heads/${branch}:${remoteRef}`], path, FETCH_TIMEOUT_MS)
    const localSha = await revParse(['--verify', '--quiet', `refs/heads/${branch}`], path)

    if (localSha && localSha !== sha && !await isAncestor(path, localSha, sha))
      return detachAt(path, sha, `Your local ${branch} has commits that are not in the merge request, so it was left alone and the merge request's commit is checked out without a branch.`, branch)

    const switchArgs = localSha
      ? ['checkout', '--quiet', branch]
      : (await revParse(['--verify', '--quiet', remoteRef], path)) === sha
          ? ['checkout', '--quiet', '-b', branch, '--track', `${repo.remote}/${branch}`]
          : ['checkout', '--quiet', '-b', branch, sha]
    const switched = await git(switchArgs, path, CHECKOUT_TIMEOUT_MS)
    if (switched.code !== 0) {
      const otherPath = worktreeWithBranch((await git(['worktree', 'list', '--porcelain'], path)).stdout, branch, path)
      const detached = await detachAt(path, sha, otherPath
        ? 'The branch is already checked out in another folder, and git allows that in only one folder at a time. This folder shows the merge request\'s commit without a branch.'
        : 'The branch could not be checked out here, probably because another folder has it. This folder shows the merge request\'s commit without a branch.', branch)
      return { ...detached, otherPath }
    }
    if (localSha && localSha !== sha)
      await gitOk(['merge', '--quiet', '--ff-only', sha], path, CHECKOUT_TIMEOUT_MS)
    return { status: 'ready', path, branch, sha, message: null }
  }

  return { inspect, createWorktree, checkout }
}
