import type { LocalChangedFile, LocalChanges } from '../../shared/local-changes'
import type { MrRef } from '../../shared/types'
import type { GitTools } from './git'
import type { LocalHost } from './host'
import { countChanges } from '../../shared/line-map'
import { parseChangedRanges } from '../../shared/local-changes'
import { readUnpushed } from './commits'
import { GitError } from './git'

const MAX_PATCH_CHARS = 2_000_000

interface StatusEntry {
  code: string
  path: string
  previousPath: string | null
}

export function parsePorcelainStatus(output: string): StatusEntry[] {
  const parts = output.split('\0')
  const entries: StatusEntry[] = []
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!
    if (part.length < 4)
      continue
    const code = part.slice(0, 2)
    const path = part.slice(3)
    const renamed = code[0] === 'R' || code[0] === 'C'
    entries.push({ code, path, previousPath: renamed ? parts[++index] ?? null : null })
  }
  return entries
}

function statusOf(entry: StatusEntry): LocalChangedFile['status'] {
  if (entry.code === '??' || entry.code.includes('A'))
    return 'added'
  if (entry.code.includes('D'))
    return 'removed'
  if (entry.previousPath)
    return 'renamed'
  return 'modified'
}

export function splitPatchByFile(patch: string) {
  const chunks = new Map<string, string>()
  for (const chunk of patch.split(/^(?=diff --git )/m)) {
    if (!chunk.startsWith('diff --git '))
      continue
    const target = /^\+\+\+ (?:b\/)?(.+)$/m.exec(chunk)?.[1]
    const source = /^--- (?:a\/)?(.+)$/m.exec(chunk)?.[1]
    const header = /^diff --git a\/(.+?) b\/(.+)$/m.exec(chunk)
    const path = target && target !== '/dev/null' ? target : source && source !== '/dev/null' ? source : header?.[2]
    if (path)
      chunks.set(path.trim(), chunk)
  }
  return chunks
}

export async function readStatus(gitTools: GitTools, repoPath: string) {
  const result = await gitTools.git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], repoPath)
  if (result.code !== 0)
    throw new GitError(result.stderr.trim() || 'git status failed.')
  return parsePorcelainStatus(result.stdout)
}

async function readChangedSinceHead(gitTools: GitTools, repoPath: string, headSha: string) {
  if (!/^[0-9a-f]{7,64}$/i.test(headSha))
    return null
  const known = await gitTools.git(['cat-file', '-e', `${headSha}^{commit}`], repoPath)
  if (known.code !== 0)
    return null
  const diff = await gitTools.git(['diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', headSha], repoPath)
  return diff.code === 0 ? parseChangedRanges(diff.stdout) : null
}

export async function readLocalChanges(gitTools: GitTools, ref: MrRef, rawRepoPath: string, headSha = ''): Promise<LocalChanges> {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  const entries = await readStatus(gitTools, repo.path)
  let patch = entries.some(entry => entry.code !== '??')
    ? (await gitTools.git(['diff', 'HEAD', '--no-color', '--no-ext-diff', '-M'], repo.path)).stdout
    : ''
  for (const entry of entries.filter(each => each.code === '??')) {
    if (patch.length > MAX_PATCH_CHARS)
      break
    patch += (await gitTools.git(['diff', '--no-color', '--no-ext-diff', '--no-index', '--', '/dev/null', entry.path], repo.path)).stdout
  }
  const truncated = patch.length > MAX_PATCH_CHARS
  const chunks = splitPatchByFile(truncated ? patch.slice(0, MAX_PATCH_CHARS) : patch)
  const files = entries.map((entry): LocalChangedFile => {
    const chunk = chunks.get(entry.path) ?? ''
    const counts = countChanges(chunk)
    return {
      path: entry.path,
      previousPath: entry.previousPath,
      status: statusOf(entry),
      untracked: entry.code === '??',
      additions: counts.additions,
      deletions: counts.deletions,
      isBinary: /^Binary files /m.test(chunk),
      diff: chunk,
    }
  })
  return {
    path: repo.path,
    files,
    unpushed: headSha ? await readUnpushed(gitTools, repo.path, headSha) : [],
    truncated,
    changedSinceHead: await readChangedSinceHead(gitTools, repo.path, headSha),
  }
}

export async function discardLocalChanges(host: LocalHost, gitTools: GitTools, ref: MrRef, rawRepoPath: string, paths: string[] | null) {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  const entries = await readStatus(gitTools, repo.path)
  const wanted = paths === null ? entries : entries.filter(entry => paths.includes(entry.path))
  if (paths !== null && wanted.length !== new Set(paths).size)
    throw new GitError('Some of these files have no local changes any more. Reload the local changes and try again.')
  const tracked = wanted.filter(entry => entry.code !== '??').flatMap(entry => entry.previousPath ? [entry.path, entry.previousPath] : [entry.path])
  if (tracked.length)
    await gitTools.gitOk(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked], repo.path)
  for (const entry of wanted.filter(each => each.code === '??'))
    await host.remove(`${repo.path}/${entry.path}`)
  return { discarded: wanted.map(entry => entry.path) }
}
