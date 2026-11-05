import type { ChangePr, LocalChange } from '../../shared/self-improve'
import type { GitTools } from '../local/git'
import type { LocalHost } from '../local/host'
import type { OverlayStore } from './overlay'
import { prBody, prBranch, prTitle, readPrNumber, SELF_IMPROVE_BASE } from '../../shared/self-improve-pr'
import { lastLines } from '../local/host'

const GH_TIMEOUT_MS = 60_000
const CLONE_TIMEOUT_MS = 5 * 60_000

export type PullRequestProblem = 'gh-missing' | 'gh-signed-out' | 'no-source' | 'does-not-apply' | 'failed'

export class PullRequestError extends Error {
  constructor(message: string, public problem: PullRequestProblem) {
    super(message)
  }
}

export interface PullRequestOptions {
  host: LocalHost
  tools: GitTools
  overlay: OverlayStore
  repo: string
  workDir: string
  gh: Promise<string | null>
  remoteUrl?: (repo: string) => string
}

interface Base {
  ref: string
  note: string | null
  fetchFrom?: { url: string, branch: string }
}

export type PullRequests = ReturnType<typeof createPullRequests>

export function createPullRequests(options: PullRequestOptions) {
  const { host, tools, overlay, repo } = options
  const remoteUrl = options.remoteUrl ?? ((name: string) => `https://github.com/${name}.git`)
  const cloneDir = `${options.workDir}/repo`
  const owner = repo.split('/')[0]!.toLowerCase()

  async function ghPath() {
    const gh = await options.gh
    if (!gh)
      throw new PullRequestError('GitHub CLI (gh) is not installed.', 'gh-missing')
    return gh
  }

  async function gh(args: string[]) {
    const result = await host.run([await ghPath(), ...args], { cwd: host.homeDir, env: await host.env(), timeoutMs: GH_TIMEOUT_MS })
    if (result.code !== 0)
      throw new PullRequestError(`gh ${args[0]} failed: ${lastLines(result.stderr) || `exit code ${result.code}`}`, 'failed')
    return result.stdout.trim()
  }

  async function login() {
    const status = await host.run([await ghPath(), 'auth', 'status'], { cwd: host.homeDir, env: await host.env(), timeoutMs: GH_TIMEOUT_MS })
    if (status.code !== 0)
      throw new PullRequestError('GitHub CLI (gh) is not signed in. Run `gh auth login` in a terminal.', 'gh-signed-out')
    return gh(['api', 'user', '--jq', '.login'])
  }

  async function git(args: string[], timeoutMs?: number) {
    // Lets git push over https with the account gh is signed in to.
    return tools.gitOk(['-c', 'credential.helper=', '-c', `credential.helper=!${await ghPath()} auth git-credential`, ...args], cloneDir, timeoutMs)
  }

  async function prepareClone() {
    await host.makeDir(options.workDir)
    if (!await host.exists(`${cloneDir}/.git`)) {
      await host.remove(cloneDir)
      await tools.gitOk(['clone', '--quiet', remoteUrl(repo), cloneDir], options.workDir, CLONE_TIMEOUT_MS)
    }
    await git(['fetch', '--quiet', '--tags', '--force', 'origin'], CLONE_TIMEOUT_MS)
    await git(['reset', '--quiet', '--hard'])
    await git(['clean', '-fdq'])
  }

  async function sourcePatches(change: LocalChange) {
    const patches: string[] = []
    for (const commit of change.commits) {
      const patch = await overlay.sourcePatch(commit)
      if (patch.trim())
        patches.push(patch)
    }
    if (!patches.length)
      throw new PullRequestError('Claude changed no source files, so there is nothing to send.', 'no-source')
    return patches
  }

  async function applyOn(base: Base, branch: string, patches: string[]) {
    if (base.fetchFrom)
      await git(['fetch', '--quiet', base.fetchFrom.url, base.fetchFrom.branch])
    await git(['checkout', '--quiet', '--force', '-B', branch, base.ref])
    for (const [index, patch] of patches.entries()) {
      const file = `${options.workDir}/change-${index}.patch`
      await host.writeFile(file, patch)
      const applied = await tools.git(['apply', '--3way', '--index', file], cloneDir)
      await host.remove(file)
      if (applied.code !== 0) {
        await git(['reset', '--quiet', '--hard'])
        return false
      }
    }
    return true
  }

  async function send(change: LocalChange, earlier: LocalChange[]): Promise<ChangePr> {
    const account = await login()
    const ownRepo = account.toLowerCase() === owner
    const target = ownRepo ? repo : `${account}/${repo.split('/')[1]}`
    if (!ownRepo)
      await gh(['repo', 'fork', repo, '--clone=false', '--remote=false'])
    const pushUrl = remoteUrl(target)

    await prepareClone()
    const patches = await sourcePatches(change)
    const branch = change.pr?.branch ?? prBranch(change)
    const bases: Base[] = [
      { ref: `origin/${SELF_IMPROVE_BASE}`, note: null },
      ...earlier.filter(item => item.pr?.state === 'open').reverse().map(item => ({
        ref: 'FETCH_HEAD',
        note: `Depends on #${item.pr!.number}, which this change builds on.`,
        fetchFrom: { url: pushUrl, branch: item.pr!.branch },
      })),
      { ref: `v${change.version}`, note: `Made on version ${change.version}. It did not apply to ${SELF_IMPROVE_BASE} as it is, so it may need a rebase.` },
    ]
    let used: Base | null = null
    for (const base of bases) {
      if (await applyOn(base, branch, patches).catch(() => false)) {
        used = base
        break
      }
    }
    if (!used)
      throw new PullRequestError('The change does not apply to the repository. Send the earlier changes it builds on first.', 'does-not-apply')

    await git(['commit', '--quiet', '-m', `${prTitle(change)}\n\n${prBody(change, null)}`])
    await git(['push', '--quiet', '--force', pushUrl, `HEAD:refs/heads/${branch}`], CLONE_TIMEOUT_MS)
    if (change.pr?.state === 'open')
      return change.pr

    const bodyFile = `${options.workDir}/body-${change.id}.md`
    await host.writeFile(bodyFile, prBody(change, used.note))
    try {
      const url = await gh(['pr', 'create', '--repo', repo, '--base', SELF_IMPROVE_BASE, '--head', ownRepo ? branch : `${account}:${branch}`, '--title', prTitle(change), '--body-file', bodyFile])
      const number = readPrNumber(url)
      if (!number)
        throw new PullRequestError(`gh pr create did not return a pull request link: ${url}`, 'failed')
      return { number, url: url.trim(), branch, state: 'open' }
    }
    finally {
      await host.remove(bodyFile)
    }
  }

  async function state(pr: ChangePr): Promise<ChangePr['state']> {
    const value = await gh(['pr', 'view', String(pr.number), '--repo', repo, '--json', 'state', '--jq', '.state'])
    return value === 'MERGED' ? 'merged' : value === 'CLOSED' ? 'closed' : 'open'
  }

  async function patch(change: LocalChange) {
    return (await sourcePatches(change)).join('\n')
  }

  return { send, state, patch }
}
