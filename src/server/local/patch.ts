import type { MrRef } from '../../shared/types'
import type { GitTools } from './git'
import type { LocalHost } from './host'
import { GitError } from './git'
import { lastLines } from './host'
import { patchHasChanges } from '../../shared/suggestions'

const APPLY_FLAGS = ['apply', '--recount', '--whitespace=nowarn']

function gitPath(header: string, prefix: 'a/' | 'b/', fallback: string) {
  const path = header.slice(4).split('\t')[0]!.trim()
  if (path !== '/dev/null')
    return path
  return `${prefix}${fallback.slice(4).split('\t')[0]!.trim().replace(/^[ab]\//, '')}`
}

export function withGitHeaders(patch: string) {
  const lines = patch.split('\n')
  const output: string[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const next = lines[index + 1]
    const hasHeader = output.at(-1)?.startsWith('diff --git ') || output.at(-1)?.startsWith('index ') || output.at(-1)?.startsWith('new file mode') || output.at(-1)?.startsWith('deleted file mode')
    if (line.startsWith('--- ') && next?.startsWith('+++ ') && !hasHeader)
      output.push(`diff --git ${gitPath(line, 'a/', next)} ${gitPath(next, 'b/', line)}`)
    output.push(line)
  }
  return output.join('\n')
}

export interface AppliedPatch {
  path: string
  files: string[]
  alreadyApplied: boolean
}

function numstatFiles(numstat: string) {
  return numstat.split('\n').map(line => line.split('\t')[2]).filter((path): path is string => Boolean(path))
}

export async function applyPatch(host: LocalHost, gitTools: GitTools, ref: MrRef, repoPath: string, patch: string): Promise<AppliedPatch> {
  if (!patchHasChanges(patch))
    throw new GitError('This patch has no changed lines, so it looks cut off. Ask Claude to send the whole patch again.')
  const repo = await gitTools.openRepository(repoPath, ref)
  const dir = `${host.cacheDir}/patches`
  await host.makeDir(dir)
  const file = `${dir}/${crypto.randomUUID()}.patch`
  // --recount ignores hunk lengths, so without these headers git reads the next file's --- line as a removed line.
  const normalized = withGitHeaders(patch)
  await host.writeFile(file, normalized.endsWith('\n') ? normalized : `${normalized}\n`)
  try {
    const check = await gitTools.git([...APPLY_FLAGS, '--check', file], repo.path)
    if (check.code !== 0) {
      const reverse = await gitTools.git([...APPLY_FLAGS, '--reverse', '--check', file], repo.path)
      if (reverse.code === 0)
        return { path: repo.path, files: numstatFiles(await gitTools.gitOk([...APPLY_FLAGS, '--numstat', file], repo.path)), alreadyApplied: true }
      throw new GitError(`The patch doesn't apply to ${repo.path}. ${lastLines(check.stderr)}`)
    }
    const numstat = await gitTools.gitOk([...APPLY_FLAGS, '--numstat', file], repo.path)
    await gitTools.gitOk([...APPLY_FLAGS, file], repo.path)
    return { path: repo.path, files: numstatFiles(numstat), alreadyApplied: false }
  }
  finally {
    await host.remove(file).catch(() => null)
  }
}
