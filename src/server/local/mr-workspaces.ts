import type { CreatedWorkspace, LocalCheckout } from '../../shared/local-repo'
import { workspaceFolderFor } from '../../shared/local-repo'
import type { MrRef } from '../../shared/types'
import type { GitTools } from './git'
import type { LocalHost } from './host'
import type { createRepoLinks } from './repo-link'
import type { MrPlace, WorkspaceOwners } from './workspace-guard'
import { mrKey } from '../../shared/mr-ref'
import { readStatus } from './changes'
import { GitError } from './git'
import { lastLines } from './host'
import { ensureBelongs } from './workspace-guard'

const CHECKOUT_TIMEOUT_MS = 10 * 60_000
const COPY_TIMEOUT_MS = 10 * 60_000
const MAX_DEPENDENCY_DEPTH = 5

interface Entry {
  path: string
  ref: MrRef
}

type RepoLinks = ReturnType<typeof createRepoLinks>

export function createMrWorkspaces(host: LocalHost, gitTools: GitTools, repoLinks: RepoLinks, owners: WorkspaceOwners) {
  const file = `${host.cacheDir}/mr-workspaces.json`
  let queue: Promise<unknown> = Promise.resolve()

  async function readAll(): Promise<Record<string, Entry>> {
    try {
      return JSON.parse(await host.readFile(file) ?? '{}') as Record<string, Entry>
    }
    catch {
      return {}
    }
  }

  function change(update: (all: Record<string, Entry>) => void) {
    queue = queue.catch(() => null).then(async () => {
      const all = await readAll()
      update(all)
      await host.makeDir(host.cacheDir)
      await host.writeFile(file, JSON.stringify(all))
    })
    return queue
  }

  async function get(ref: MrRef) {
    const entry = (await readAll())[mrKey(ref)]
    if (!entry)
      return null
    const alive = await host.exists(entry.path) && (await gitTools.git(['rev-parse', '--git-dir'], entry.path)).code === 0
    if (alive)
      return entry.path
    await change(all => delete all[mrKey(ref)])
    return null
  }

  async function copyDependencies(from: string, to: string) {
    const env = await host.env()
    const found = await host.run(['find', from, '-maxdepth', String(MAX_DEPENDENCY_DEPTH), '-name', '.git', '-prune', '-o', '-type', 'd', '-name', 'node_modules', '-prune', '-print'], { cwd: from, env, timeoutMs: COPY_TIMEOUT_MS })
    const folders = found.stdout.split('\n').filter(Boolean).map(path => path.slice(from.length + 1)).filter(Boolean)
    if (!folders.length)
      return 'There were no node_modules folders to copy.'
    let copied = 0
    for (const folder of folders) {
      if (!await host.exists(`${to}/${folder.slice(0, folder.lastIndexOf('/') + 1) || '.'}`) || await host.exists(`${to}/${folder}`))
        continue
      const result = await host.run(['cp', '-c', '-R', `${from}/${folder}`, `${to}/${folder}`], { cwd: from, env, timeoutMs: COPY_TIMEOUT_MS })
      if (result.code !== 0)
        return copied ? `Copied ${copied} of ${folders.length} node_modules folders, then copying stopped: ${lastLines(result.stderr)} Run your package install in the new folder.` : 'Dependencies were not copied, because this disk does not support instant copies. Run your package install in the new folder before using git hooks or tests.'
      copied++
    }
    return `Copied ${copied === 1 ? '1 node_modules folder' : `${copied} node_modules folders`} from the shared folder, so git hooks and tests work right away. If this branch changes dependencies, run your package install.`
  }

  async function addFolder(sharedPath: string, target: string, ref: MrRef, mr: MrPlace, moving: { branch: string | null, head: string } | null) {
    if (moving) {
      const args = moving.branch ? ['worktree', 'add', '--quiet', target, moving.branch] : ['worktree', 'add', '--quiet', '--detach', target, moving.head]
      await gitTools.gitOk(args, sharedPath, CHECKOUT_TIMEOUT_MS)
      const checkout: LocalCheckout = moving.branch
        ? { status: 'ready', path: target, branch: mr.branch, sha: mr.headSha, message: null }
        : { status: 'detached', path: target, branch: mr.branch, sha: moving.head, message: 'The moved changes are on a commit without a branch, as they were in the shared folder.' }
      return checkout
    }
    await gitTools.gitOk(['worktree', 'add', '--quiet', '--detach', target, mr.headSha], sharedPath, CHECKOUT_TIMEOUT_MS)
    return repoLinks.checkout(target, ref, mr.branch, mr.headSha)
  }

  async function create(ref: MrRef, rawSharedPath: string, mr: MrPlace, moveChanges: boolean): Promise<CreatedWorkspace> {
    const existing = await get(ref)
    if (existing)
      throw new GitError(`This merge request already has its own folder at ${existing}.`)
    const repo = moveChanges ? await ensureBelongs(gitTools, ref, rawSharedPath, mr) : await gitTools.openRepository(rawSharedPath, ref)
    const target = workspaceFolderFor(repo.path, ref)
    if (await host.exists(target))
      throw new GitError(`${target} already exists. Move or delete it, then try again.`)
    await gitTools.ensureCommit(repo, ref, mr.headSha)
    await host.makeDir(target.slice(0, target.lastIndexOf('/')))

    let moving: { branch: string | null, head: string } | null = null
    let stash: string | null = null
    if (moveChanges) {
      const symbolic = await gitTools.git(['symbolic-ref', '--short', '-q', 'HEAD'], repo.path)
      const branch = symbolic.code === 0 ? symbolic.stdout.trim() : null
      const head = (await gitTools.gitOk(['rev-parse', 'HEAD'], repo.path)).trim()
      if ((await readStatus(gitTools, repo.path)).length) {
        await gitTools.gitOk(['stash', 'push', '--include-untracked', '--quiet', '-m', `pull-review: move !${ref.iid} to its own folder`], repo.path)
        stash = (await gitTools.gitOk(['rev-parse', 'stash@{0}'], repo.path)).trim()
      }
      if (branch)
        await gitTools.gitOk(['checkout', '--quiet', '--detach'], repo.path)
      moving = { branch, head }
    }

    let checkout: LocalCheckout
    try {
      checkout = await addFolder(repo.path, target, ref, mr, moving)
    }
    catch (error) {
      if (moving?.branch)
        await gitTools.git(['checkout', '--quiet', moving.branch], repo.path)
      if (stash)
        await gitTools.git(['stash', 'pop', '--quiet', '--index'], repo.path)
      throw error
    }

    await change((all) => {
      all[mrKey(ref)] = { path: target, ref }
    })
    await owners.remember(target, { ref, branch: mr.branch, sha: mr.headSha })

    if (stash) {
      const applied = await gitTools.git(['stash', 'apply', '--quiet', '--index', stash], target)
      if (applied.code !== 0)
        throw new GitError(`The new folder is at ${target}, but your changes could not be applied there. They are safe in git stash as "pull-review: move !${ref.iid} to its own folder". ${lastLines(applied.stderr)}`)
      const index = (await gitTools.gitOk(['stash', 'list', '--format=%H'], repo.path)).split('\n').indexOf(stash)
      if (index >= 0)
        await gitTools.git(['stash', 'drop', '--quiet', `stash@{${index}}`], repo.path)
    }

    return { path: target, checkout, moved: moveChanges, dependencies: await copyDependencies(repo.path, target) }
  }

  return { get, create }
}
