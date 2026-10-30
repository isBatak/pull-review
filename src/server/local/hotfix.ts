import type { ConflictSide, HotfixInput, HotfixPlan, HotfixProgress, HotfixStepId, PickConflictFile } from '../../shared/hotfix'
import type { ProjectRef } from '../../shared/types'
import type { GitTools, LocalRepository } from './git'
import type { LocalHost } from './host'
import { buildHotfixPlan, isSafeBranch, parseUnmerged, validateHotfixInput } from '../../shared/hotfix'
import { GitError } from './git'
import { findExecutable, lastLines } from './host'

const STEP_TIMEOUT_MS = 30_000
const LONG_STEP_TIMEOUT_MS = 10 * 60_000
const MAX_OUTPUT_LINES = 400

export type HotfixRunner = ReturnType<typeof createHotfixRunner>

export function createHotfixRunner(host: LocalHost, gitTools: GitTools) {
  const file = `${host.cacheDir}/hotfixes.json`
  let queue: Promise<unknown> = Promise.resolve()

  async function readSessions(): Promise<Record<string, HotfixInput>> {
    try {
      return JSON.parse(await host.readFile(file) ?? '{}') as Record<string, HotfixInput>
    }
    catch {
      return {}
    }
  }

  function changeSessions(update: (all: Record<string, HotfixInput>) => void) {
    queue = queue.catch(() => null).then(async () => {
      const all = await readSessions()
      update(all)
      for (const path of Object.keys(all)) {
        if (!await host.exists(path))
          delete all[path]
      }
      await host.makeDir(host.cacheDir)
      await host.writeFile(file, JSON.stringify(all))
    })
    return queue
  }

  const forget = (repo: LocalRepository) => changeSessions(all => delete all[repo.path])

  async function git(repo: LocalRepository, args: string[]) {
    return gitTools.git(args, repo.path)
  }

  async function currentBranch(repo: LocalRepository) {
    const result = await git(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
    return result.code === 0 ? result.stdout.trim() : null
  }

  async function ensureClean(repo: LocalRepository) {
    const changed = await gitTools.gitOk(['status', '--porcelain', '--untracked-files=no'], repo.path)
    if (changed)
      throw new GitError(`${repo.path} has changes that are not committed. Commit or stash them first, so they do not end up in the hotfix.\n\n${lastLines(changed, 10)}`)
  }

  async function pickHead(repo: LocalRepository) {
    const result = await git(repo, ['rev-parse', '--quiet', '--verify', 'CHERRY_PICK_HEAD'])
    return result.code === 0 ? result.stdout.trim() : null
  }

  async function unmergedFiles(repo: LocalRepository): Promise<PickConflictFile[]> {
    const result = await git(repo, ['status', '--porcelain', '-z', '--untracked-files=no'])
    if (result.code !== 0)
      throw new GitError(lastLines(result.stderr) || 'git status failed.')
    return parseUnmerged(result.stdout)
  }

  async function isOnHotfix(repo: LocalRepository, input: HotfixInput) {
    if (await pickHead(repo))
      return true
    if (await currentBranch(repo))
      return false
    return (await git(repo, ['merge-base', '--is-ancestor', input.tag, 'HEAD'])).code === 0
  }

  async function activeSession(repo: LocalRepository) {
    const input = (await readSessions())[repo.path]
    if (!input)
      return null
    if (await isOnHotfix(repo, input))
      return input
    await forget(repo)
    return null
  }

  async function branchBefore(repo: LocalRepository, tag: string) {
    const prefix = 'checkout: moving from '
    const suffix = ` to ${tag}`
    const moves = await gitTools.gitOk(['reflog', '--format=%gs', '-n', '200'], repo.path)
    const branch = moves.split('\n').find(line => line.startsWith(prefix) && line.endsWith(suffix))?.slice(prefix.length, -suffix.length)
    if (!branch || !isSafeBranch(branch))
      return null
    return (await git(repo, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])).code === 0 ? branch : null
  }

  async function adoptStartedHotfix(repo: LocalRepository, input: HotfixInput) {
    if (await currentBranch(repo) || (await git(repo, ['merge-base', '--is-ancestor', input.tag, 'HEAD'])).code !== 0)
      return null
    const ahead = (await gitTools.gitOk(['log', '--format=%B%x00', `${input.tag}..HEAD`], repo.path)).split('\0').map(body => body.trim()).filter(Boolean)
    if (ahead.length > input.commits.length + 1 || !ahead.every(body => body.includes('(cherry picked from commit ') || body.includes('chore: version packages')))
      return null
    const picking = await pickHead(repo)
    if (picking && !input.commits.includes(picking))
      throw new GitError(`${repo.path} is still cherry-picking ${picking.slice(0, 8)} onto ${input.tag} from an earlier try. Pick that commit too to carry on, or stop it with git cherry-pick --abort.`)
    if (!picking)
      await ensureClean(repo)
    const adopted = { ...input, returnTo: await branchBefore(repo, input.tag) }
    await changeSessions((all) => { all[repo.path] = adopted })
    return adopted
  }

  async function stepDone(repo: LocalRepository, plan: HotfixPlan, id: HotfixStepId) {
    const { input } = plan
    if (id === 'checkout')
      return true
    if (id.startsWith('pick:')) {
      const bodies = await gitTools.gitOk(['log', '--format=%B', `${input.tag}..HEAD`], repo.path)
      return bodies.includes(`(cherry picked from commit ${id.slice(5)})`)
    }
    if (id === 'version') {
      try {
        return (JSON.parse(await host.readFile(`${repo.path}/${input.packageDir}/package.json`) ?? '{}') as { version?: string }).version === input.version
      }
      catch {
        return false
      }
    }
    if (id === 'commit') {
      const message = plan.steps.find(step => step.id === 'commit')!.args[3]
      return await gitTools.gitOk(['log', '-1', '--format=%s'], repo.path) === message
    }
    if (id === 'tag') {
      const tagged = await git(repo, ['rev-parse', '--quiet', '--verify', `refs/tags/${plan.rcTag}^{commit}`])
      return tagged.code === 0 && tagged.stdout.trim() === await gitTools.gitOk(['rev-parse', 'HEAD'], repo.path)
    }
    if (id === 'push')
      return Boolean((await git(repo, ['ls-remote', '--tags', plan.remote, `refs/tags/${plan.rcTag}`])).stdout.trim())
    return false
  }

  async function progressOf(repo: LocalRepository, input: HotfixInput): Promise<HotfixProgress> {
    const plan = buildHotfixPlan(input, repo.path, repo.remote)
    const picking = await pickHead(repo)
    const conflictIndex = picking ? plan.steps.findIndex(step => step.id === `pick:${picking}`) : -1
    let reached = conflictIndex
    if (conflictIndex < 0) {
      for (const [index, step] of plan.steps.entries()) {
        if (step.id === 'fetch' || step.id === 'diff')
          continue
        if (!await stepDone(repo, plan, step.id))
          break
        reached = index + 1
      }
    }
    return {
      plan,
      done: plan.steps.slice(0, Math.max(reached, 0)).map(step => step.id),
      conflict: conflictIndex >= 0 ? { stepId: plan.steps[conflictIndex]!.id, files: await unmergedFiles(repo) } : null,
    }
  }

  async function runNpm(args: string[], cwd: string, timeoutMs: number) {
    const npm = await findExecutable(host, 'npm')
    if (!npm)
      throw new GitError('npm is not installed, so the version could not be set.')
    return host.run([npm, ...args], { cwd, env: await host.env(), timeoutMs })
  }

  return {
    async active(ref: ProjectRef, rawRepoPath: string): Promise<HotfixProgress | null> {
      const repo = await gitTools.openRepository(rawRepoPath, ref)
      const input = await activeSession(repo)
      return input ? progressOf(repo, input) : null
    },

    async plan(ref: ProjectRef, rawRepoPath: string, input: HotfixInput): Promise<HotfixPlan> {
      const invalid = validateHotfixInput(input)
      if (invalid)
        throw new GitError(invalid)
      const repo = await gitTools.openRepository(rawRepoPath, ref)
      const active = await activeSession(repo)
      if (active) {
        const plan = buildHotfixPlan(active, repo.path, repo.remote)
        if (active.tag === input.tag)
          return plan
        throw new GitError(`A hotfix from ${active.tag} to ${plan.rcTag} is still open in ${repo.path}. Finish or abort it first.`)
      }
      const adopted = await adoptStartedHotfix(repo, input)
      if (adopted)
        return buildHotfixPlan(adopted, repo.path, repo.remote)
      await ensureClean(repo)
      return buildHotfixPlan({ ...input, returnTo: await currentBranch(repo) }, repo.path, repo.remote)
    },

    async run(ref: ProjectRef, rawRepoPath: string, input: HotfixInput, stepId: HotfixStepId) {
      const invalid = validateHotfixInput(input)
      if (invalid)
        throw new GitError(invalid)
      const repo = await gitTools.openRepository(rawRepoPath, ref)
      const plan = buildHotfixPlan(input, repo.path, repo.remote)
      const step = plan.steps.find(item => item.id === stepId)
      if (!step)
        throw new GitError(`Unknown step ${stepId}.`)
      if (step.id === 'checkout')
        await ensureClean(repo)

      const [program, ...args] = step.args as [string, ...string[]]
      const timeoutMs = ['fetch', 'checkout', 'push', 'return'].includes(step.id) ? LONG_STEP_TIMEOUT_MS : STEP_TIMEOUT_MS
      const result = program === 'git'
        ? await gitTools.git(args, repo.path, timeoutMs)
        : await runNpm(args, repo.path, timeoutMs)
      const output = lastLines(`${result.stdout}\n${result.stderr}`, MAX_OUTPUT_LINES)
      if (result.code === 0) {
        if (step.id === 'checkout')
          await changeSessions((all) => { all[repo.path] = input })
        if (step.id === 'return' || (step.id === 'push' && !input.returnTo))
          await forget(repo)
        return { output, conflicts: null }
      }
      if (step.id.startsWith('pick:') && await pickHead(repo)) {
        const conflicts = await unmergedFiles(repo)
        if (conflicts.length)
          return { output, conflicts }
      }
      throw new GitError(output || `${program} failed with code ${result.code}.`)
    },

    async conflicts(ref: ProjectRef, rawRepoPath: string) {
      const repo = await gitTools.openRepository(rawRepoPath, ref)
      if (!await pickHead(repo))
        return { inProgress: false, files: [] }
      return { inProgress: true, files: await unmergedFiles(repo) }
    },

    async resolve(ref: ProjectRef, rawRepoPath: string, path: string, side: ConflictSide) {
      const repo = await gitTools.openRepository(rawRepoPath, ref)
      const conflict = (await unmergedFiles(repo)).find(item => item.path === path)
      if (!conflict)
        throw new GitError(`${path} has no conflict to resolve.`)
      if (side === 'edited') {
        const text = await host.readFile(`${repo.path}/${path}`)
        if (text === null) {
          await gitTools.gitOk(['rm', '--quiet', '--', path], repo.path)
          return
        }
        if (/^(<{7}|>{7}) /m.test(text))
          throw new GitError(`${path} still has conflict markers, like <<<<<<<. Remove them and save the file, then try again.`)
        await gitTools.gitOk(['add', '--', path], repo.path)
        return
      }
      const deleted = side === 'tag' ? conflict.tagDeleted : conflict.commitDeleted
      if (deleted) {
        await gitTools.gitOk(['rm', '--quiet', '--', path], repo.path)
        return
      }
      await gitTools.gitOk(['checkout', side === 'tag' ? '--ours' : '--theirs', '--', path], repo.path)
      await gitTools.gitOk(['add', '--', path], repo.path)
    },

    async continuePick(ref: ProjectRef, rawRepoPath: string) {
      const repo = await gitTools.openRepository(rawRepoPath, ref)
      const left = await unmergedFiles(repo)
      if (left.length)
        throw new GitError(`Resolve these files first: ${left.map(item => item.path).join(', ')}.`)
      const result = await git(repo, ['-c', 'core.editor=true', 'cherry-pick', '--continue'])
      const output = lastLines(`${result.stdout}\n${result.stderr}`, MAX_OUTPUT_LINES)
      if (result.code === 0)
        return { output }
      if (/now empty/i.test(output))
        throw new GitError('With these choices the commit changes nothing on this tag. Click Abort to stop the hotfix, or use the commit version for some files.')
      throw new GitError(output || `git cherry-pick --continue failed with code ${result.code}.`)
    },

    async abort(ref: ProjectRef, rawRepoPath: string) {
      const repo = await gitTools.openRepository(rawRepoPath, ref)
      const input = await activeSession(repo)
      if (await pickHead(repo))
        await gitTools.gitOk(['cherry-pick', '--abort'], repo.path)
      if (!input)
        return { returnedTo: null }
      const plan = buildHotfixPlan(input, repo.path, repo.remote)
      if (!await stepDone(repo, plan, 'push'))
        await git(repo, ['tag', '--delete', plan.rcTag])
      await gitTools.gitOk(['reset', '--hard', '--quiet'], repo.path)
      if (input.returnTo)
        await gitTools.gitOk(['checkout', '--quiet', input.returnTo], repo.path)
      await forget(repo)
      return { returnedTo: input.returnTo ?? null }
    },
  }
}
