import type { MrRef } from '../shared/types'
import type { LocalRepo } from './api'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseGitRemote } from '../shared/git-remote'
import { resolveToken, tokenHelp } from './token'

export { parseGitRemote }

const execFileAsync = promisify(execFile)

async function git(args: string[], cwd: string) {
  const { stdout } = await execFileAsync('git', args, { cwd })
  return stdout.trim()
}

export async function detectMrFromGit(cwd: string): Promise<MrRef> {
  const remoteUrl = await git(['remote', 'get-url', 'origin'], cwd).catch(() => {
    throw new Error('Not a git repository with an "origin" remote. Pass a merge request URL instead.')
  })
  const remote = parseGitRemote(remoteUrl)
  if (!remote)
    throw new Error(`Could not read a GitLab project from remote "${remoteUrl}".`)

  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  const token = await resolveToken(remote.host)
  if (!token)
    throw new Error(tokenHelp(remote.host))

  const query = new URLSearchParams({ source_branch: branch, state: 'opened', per_page: '1' })
  const response = await fetch(`https://${remote.host}/api/v4/projects/${encodeURIComponent(remote.project)}/merge_requests?${query}`, {
    headers: { Authorization: `Bearer ${token.token}` },
  })
  if (!response.ok)
    throw new Error(`GitLab ${response.status} while looking up the merge request for branch "${branch}".`)
  const [mr] = await response.json() as { iid: number }[]
  if (!mr)
    throw new Error(`No open merge request found for branch "${branch}" in ${remote.project}.`)
  return { host: remote.host, project: remote.project, iid: mr.iid }
}

export async function detectLocalRepo(cwd: string): Promise<LocalRepo | null> {
  const path = await git(['rev-parse', '--show-toplevel'], cwd).catch(() => null)
  const remoteUrl = path && await git(['remote', 'get-url', 'origin'], path).catch(() => null)
  const remote = remoteUrl ? parseGitRemote(remoteUrl) : null
  return path && remote ? { ...remote, path } : null
}
