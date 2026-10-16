import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitTools } from './git'
import { createNodeLocalHost } from './node-host'
import { createWorkspaceOwners, ensureBelongs, readWorkspace } from './workspace-guard'

const ref = { host: 'gitlab.example.com', project: 'group/project', iid: 7 }

describe('workspace guard', () => {
  let root: string
  let work: string
  let headSha: string
  const git = (...args: string[]) => execFileSync('git', args, { cwd: work, encoding: 'utf8' }).trim()

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pull-review-guard-'))
    work = join(root, 'work')
    execFileSync('git', ['init', '--quiet', '-b', 'feature', work])
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    git('remote', 'add', 'origin', 'git@gitlab.example.com:group/project.git')
    writeFileSync(join(work, 'a.ts'), 'a\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'start')
    headSha = git('rev-parse', 'HEAD')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('belongs on the merge request branch and on its commit without a branch', async () => {
    const tools = createGitTools(createNodeLocalHost())
    expect((await readWorkspace(tools, work, { branch: 'feature', headSha })).belongs).toBe(true)
    git('checkout', '--quiet', '--detach')
    expect((await readWorkspace(tools, work, { branch: 'feature', headSha })).belongs).toBe(true)
  })

  it('does not belong on another branch, counts its changes, and refuses to change it', async () => {
    const host = { ...createNodeLocalHost(), cacheDir: join(root, 'cache') }
    const tools = createGitTools(host)
    const owners = createWorkspaceOwners(host)
    git('checkout', '--quiet', '-b', 'other')
    writeFileSync(join(work, 'a.ts'), 'other work\n')
    writeFileSync(join(work, 'b.ts'), 'new\n')
    const otherMr = { ...ref, iid: 8 }
    await owners.remember(work, { ref: otherMr, branch: 'other', sha: headSha })

    const workspace = await readWorkspace(tools, work, { branch: 'feature', headSha }, owners)
    expect(workspace).toMatchObject({ branch: 'other', belongs: false, changedFiles: 2, changedPaths: ['a.ts', 'b.ts'], owner: otherMr })
    await expect(ensureBelongs(tools, ref, work, { branch: 'feature', headSha })).rejects.toThrow('on branch other, not on this merge request\'s branch feature')
  })

  it('forgets the owner once the folder is on a different branch than recorded', async () => {
    const host = { ...createNodeLocalHost(), cacheDir: join(root, 'cache') }
    const owners = createWorkspaceOwners(host)
    await owners.remember(work, { ref: { ...ref, iid: 8 }, branch: 'other', sha: headSha })
    git('checkout', '--quiet', '-b', 'third')
    expect((await readWorkspace(createGitTools(host), work, { branch: 'feature', headSha }, owners)).owner).toBeNull()
  })
})
