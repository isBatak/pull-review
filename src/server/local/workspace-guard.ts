import type { LocalWorkspace } from '../../shared/local-changes'
import type { MrRef } from '../../shared/types'
import type { GitTools } from './git'
import type { LocalHost } from './host'
import { describeWorkspace, workspaceBelongs } from '../../shared/local-changes'
import { readStatus } from './changes'
import { GitError } from './git'

interface Owner {
  ref: MrRef
  branch: string
  sha: string
}

const MAX_LISTED_PATHS = 20

export interface MrPlace {
  branch: string
  headSha: string
}

export function createWorkspaceOwners(host: LocalHost) {
  const file = `${host.cacheDir}/workspace-owners.json`
  let queue: Promise<unknown> = Promise.resolve()

  async function readAll(): Promise<Record<string, Owner>> {
    try {
      return JSON.parse(await host.readFile(file) ?? '{}') as Record<string, Owner>
    }
    catch {
      return {}
    }
  }

  return {
    remember(path: string, owner: Owner) {
      queue = queue.catch(() => null).then(async () => {
        const all = await readAll()
        all[path] = owner
        await host.makeDir(host.cacheDir)
        await host.writeFile(file, JSON.stringify(all))
      })
      return queue
    },
    async lookup(path: string) {
      return (await readAll())[path] ?? null
    },
  }
}

export type WorkspaceOwners = ReturnType<typeof createWorkspaceOwners>

export async function readWorkspace(gitTools: GitTools, repoPath: string, mr: MrPlace, owners?: WorkspaceOwners | null): Promise<LocalWorkspace> {
  const symbolic = await gitTools.git(['symbolic-ref', '--short', '-q', 'HEAD'], repoPath)
  const branch = symbolic.code === 0 ? symbolic.stdout.trim() : null
  const headResult = await gitTools.git(['rev-parse', 'HEAD'], repoPath)
  const head = headResult.code === 0 ? headResult.stdout.trim() : null
  const containsMrHead = /^[0-9a-f]{7,64}$/i.test(mr.headSha)
    && (await gitTools.git(['merge-base', '--is-ancestor', mr.headSha, 'HEAD'], repoPath)).code === 0
  const belongs = workspaceBelongs({ branch, mrBranch: mr.branch, containsMrHead })
  const recorded = belongs ? null : await owners?.lookup(repoPath)
  const owner = recorded && (recorded.branch === branch || (branch === null && recorded.sha === head)) ? recorded.ref : null
  const changed = belongs ? [] : (await readStatus(gitTools, repoPath)).map(entry => entry.path)
  return {
    branch,
    head,
    belongs,
    changedFiles: changed.length,
    changedPaths: changed.slice(0, MAX_LISTED_PATHS),
    owner,
  }
}

export async function ensureBelongs(gitTools: GitTools, ref: MrRef, rawRepoPath: string, mr: MrPlace) {
  const repo = await gitTools.openRepository(rawRepoPath, ref)
  const workspace = await readWorkspace(gitTools, repo.path, mr)
  if (!workspace.belongs)
    throw new GitError(`${repo.path} is on ${describeWorkspace(workspace)}, not on this merge request's branch ${mr.branch}, so Pull Review won't change it from here. Switch it to this merge request first.`)
  return repo
}
