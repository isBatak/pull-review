import type { SymbolHit } from '../../shared/symbols'
import type { MrRef } from '../../shared/types'
import type { GitTools } from './git'
import { parseGitGrep } from '../../shared/symbols'
import { GitError } from './git'
import { lastLines } from './host'

const GREP_TIMEOUT_MS = 30_000
const MAX_MATCHES_PER_FILE = '20'
const EXCLUDED = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.min.js',
  '**/*.map',
  '**/*.lock',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/*.snap',
]

export async function grepSymbol(git: GitTools, input: { ref: MrRef, repoPath: string, sha: string, name: string }): Promise<{ hits: SymbolHit[], truncated: boolean }> {
  const repo = await git.openRepository(input.repoPath, input.ref)
  await git.ensureCommit(repo, input.ref, input.sha)
  const result = await git.git([
    'grep',
    '-n',
    '--column',
    '-w',
    '-I',
    '--full-name',
    '--max-count',
    MAX_MATCHES_PER_FILE,
    '-e',
    input.name,
    input.sha,
    '--',
    '.',
    ...EXCLUDED.map(pattern => `:(exclude,glob)${pattern}`),
  ], repo.path, GREP_TIMEOUT_MS)
  if (result.code > 1)
    throw new GitError(lastLines(result.stderr) || `git grep failed with code ${result.code}.`)
  return parseGitGrep(result.stdout, input.sha, input.name)
}
