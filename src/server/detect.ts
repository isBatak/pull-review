import type { MrRef } from '../shared/types'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveToken, tokenHelp } from './token'

const execFileAsync = promisify(execFile)

export interface GitRemote {
  host: string
  project: string
}

export function parseGitRemote(url: string): GitRemote | null {
  const value = url.trim().replace(/\.git$/, '')
  const scp = /^[\w.-]+@([^:/]+):(?!\d+\/)(.+)$/.exec(value)
  if (scp)
    return { host: scp[1]!, project: scp[2]! }
  try {
    const parsed = new URL(value)
    const project = parsed.pathname.replace(/^\/+/, '')
    if (!project.includes('/'))
      return null
    return { host: parsed.hostname, project }
  }
  catch {
    return null
  }
}

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
