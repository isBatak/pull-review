import type { SourceMap } from '../../shared/source-maps'
import type { GitTools } from '../local/git'
import type { LocalHost } from '../local/host'
import { ownSources } from '../../shared/source-maps'
import { GitError } from '../local/git'

export interface OverlayPart {
  name: string
  from: string
}

export interface OverlayConfig {
  root: string
  version: string
  parts: OverlayPart[]
}

export type RevertResult = { ok: true } | { ok: false, error: string }

const SHIPPED_TAG = 'shipped'
const ACTIVE_FILE = 'active'
const OFF = 'off'

export type OverlayStore = ReturnType<typeof createOverlayStore>

export function createOverlayStore(host: LocalHost, tools: GitTools, config: OverlayConfig) {
  const dir = `${config.root}/${config.version}`
  const activeFile = `${config.root}/${ACTIVE_FILE}`

  async function writeSourceTree(target: string) {
    const maps = (await tools.gitOk(['ls-files', '-z', '--', '*.map'], target)).split('\0').filter(Boolean)
    const written = new Set<string>()
    for (const mapPath of maps) {
      const text = await host.readFile(`${target}/${mapPath}`)
      if (!text)
        continue
      for (const { path, content } of ownSources(JSON.parse(text) as SourceMap)) {
        if (written.has(path))
          continue
        written.add(path)
        await host.makeDir(`${target}/source/${path.replace(/\/[^/]*$/, '')}`)
        await host.writeFile(`${target}/source/${path}`, content)
      }
    }
    return written.size
  }

  async function create() {
    const staging = `${dir}.partial`
    await host.remove(staging)
    await host.makeDir(`${staging}/build`)
    for (const part of config.parts) {
      const copied = await host.run(['/bin/cp', '-R', part.from, `${staging}/build/${part.name}`], { cwd: staging, env: await host.env(), timeoutMs: 60_000 })
      if (copied.code !== 0)
        throw new GitError(`Could not copy the shipped ${part.name}: ${copied.stderr.trim()}`)
    }
    await tools.gitOk(['init', '--quiet', '-b', 'main'], staging)
    await tools.gitOk(['config', 'user.name', 'Pull Review'], staging)
    await tools.gitOk(['config', 'user.email', 'self-improve@pull-review.local'], staging)
    await tools.gitOk(['add', 'build'], staging)
    await writeSourceTree(staging)
    await tools.gitOk(['add', '-A'], staging)
    await tools.gitOk(['commit', '--quiet', '-m', `Shipped build ${config.version}`], staging)
    await tools.gitOk(['tag', SHIPPED_TAG], staging)
    const moved = await host.run(['/bin/mv', staging, dir], { cwd: config.root, env: await host.env(), timeoutMs: 10_000 })
    if (moved.code !== 0)
      throw new GitError(`Could not finish the overlay folder: ${moved.stderr.trim()}`)
  }

  async function ensure() {
    if (!await host.exists(`${dir}/.git`)) {
      await host.makeDir(config.root)
      await create()
    }
    return dir
  }

  async function isActive() {
    return (await host.readFile(activeFile))?.trim() === config.version && await host.exists(`${dir}/.git`)
  }

  async function setActive(on: boolean) {
    await host.makeDir(config.root)
    await host.writeFile(activeFile, `${on ? config.version : OFF}\n`)
  }

  async function changedFiles() {
    const status = await tools.git(['status', '--porcelain', '-z', '--untracked-files=all'], dir)
    if (status.code !== 0)
      throw new GitError(status.stderr.trim())
    return status.stdout.split('\0').filter(Boolean).map(line => line.slice(3))
  }

  async function commit(message: string): Promise<string | null> {
    if (!(await changedFiles()).length)
      return null
    await tools.gitOk(['add', '-A'], dir)
    await tools.gitOk(['commit', '--quiet', '-m', message], dir)
    return tools.gitOk(['rev-parse', 'HEAD'], dir)
  }

  async function revert(shas: string[]): Promise<RevertResult> {
    const result = await tools.git(['revert', '--no-edit', ...[...shas].reverse()], dir)
    if (result.code === 0)
      return { ok: true }
    await tools.git(['revert', '--abort'], dir)
    return { ok: false, error: result.stderr.trim() || result.stdout.trim() }
  }

  function commitDiff(sha: string) {
    return tools.gitOk(['show', '--format=', '--no-color', '--no-ext-diff', sha, '--', 'source', 'build'], dir)
  }

  async function sourcePatch(sha: string) {
    const result = await tools.git(['show', '--format=', '--no-color', '--no-ext-diff', '--binary', '--full-index', '--relative=source', sha], dir)
    if (result.code !== 0)
      throw new GitError(result.stderr.trim() || `Could not read commit ${sha}.`)
    return result.stdout
  }

  async function applySourcePatch(file: string) {
    const applied = await tools.git(['apply', '--3way', '--directory=source', file], dir)
    if (applied.code === 0)
      return true
    await discard()
    return false
  }

  async function discard() {
    await tools.gitOk(['reset', '--quiet', '--hard', 'HEAD'], dir)
    await tools.gitOk(['clean', '-fdq'], dir)
  }

  async function reset() {
    await tools.gitOk(['reset', '--quiet', '--hard', SHIPPED_TAG], dir)
    await tools.gitOk(['clean', '-fdq'], dir)
  }

  return { dir, ensure, isActive, setActive, changedFiles, commit, commitDiff, sourcePatch, applySourcePatch, revert, discard, reset }
}
