import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitTools } from './git'
import { workspaceFolderFor } from '../../shared/local-repo'
import { createMrWorkspaces } from './mr-workspaces'
import { createNodeLocalHost } from './node-host'
import { createRepoLinks } from './repo-link'
import { createWorkspaceOwners, readWorkspace } from './workspace-guard'

const ref = { host: 'gitlab.example.com', project: 'group/project', iid: 7 }

describe('separate folders per merge request', () => {
  let root: string
  let clone: string
  let shared: string
  let headSha: string
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

  function setup() {
    const host = { ...createNodeLocalHost(), cacheDir: join(root, 'cache') }
    const tools = createGitTools(host)
    const owners = createWorkspaceOwners(host)
    return { tools, owners, workspaces: createMrWorkspaces(host, tools, createRepoLinks(host, tools), owners) }
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pull-review-mr-folders-'))
    clone = join(root, 'clone')
    shared = join(root, 'clone-review')
    execFileSync('git', ['init', '--quiet', '-b', 'main', clone])
    git(clone, 'config', 'user.email', 'test@example.com')
    git(clone, 'config', 'user.name', 'Test')
    git(clone, 'remote', 'add', 'origin', 'git@gitlab.example.com:group/project.git')
    writeFileSync(join(clone, 'a.ts'), 'a\n')
    mkdirSync(join(clone, 'node_modules'))
    writeFileSync(join(clone, '.gitignore'), 'node_modules\n')
    git(clone, 'add', '.')
    git(clone, 'commit', '--quiet', '-m', 'start')
    git(clone, 'branch', 'feature')
    headSha = git(clone, 'rev-parse', 'HEAD')
    git(clone, 'worktree', 'add', '--quiet', '-b', 'other', shared)
    mkdirSync(join(shared, 'node_modules'))
    writeFileSync(join(shared, 'node_modules', 'dep.js'), 'dep\n')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('makes a folder for a merge request while the shared folder is busy with another one', async () => {
    const { tools, workspaces } = setup()
    writeFileSync(join(shared, 'a.ts'), 'work for another merge request\n')

    const created = await workspaces.create(ref, shared, { branch: 'feature', headSha }, false)

    expect(created.path).toBe(workspaceFolderFor(shared, ref))
    expect(git(created.path, 'symbolic-ref', '--short', 'HEAD')).toBe('feature')
    expect(readFileSync(join(shared, 'a.ts'), 'utf8')).toBe('work for another merge request\n')
    expect(await workspaces.get(ref)).toBe(created.path)
    expect((await readWorkspace(tools, created.path, { branch: 'feature', headSha })).belongs).toBe(true)
    if (process.platform === 'darwin')
      expect(readFileSync(join(created.path, 'node_modules', 'dep.js'), 'utf8')).toBe('dep\n')
  })

  it('moves uncommitted changes and unpushed commits out of the shared folder', async () => {
    const { workspaces } = setup()
    git(shared, 'checkout', '--quiet', 'feature')
    writeFileSync(join(shared, 'b.ts'), 'committed locally\n')
    git(shared, 'add', 'b.ts')
    git(shared, 'commit', '--quiet', '-m', 'local commit')
    writeFileSync(join(shared, 'a.ts'), 'not committed\n')
    writeFileSync(join(shared, 'c.ts'), 'new file\n')

    const created = await workspaces.create(ref, shared, { branch: 'feature', headSha }, true)

    expect(created.moved).toBe(true)
    expect(git(created.path, 'symbolic-ref', '--short', 'HEAD')).toBe('feature')
    expect(git(created.path, 'log', '-1', '--format=%s')).toBe('local commit')
    expect(readFileSync(join(created.path, 'a.ts'), 'utf8')).toBe('not committed\n')
    expect(existsSync(join(created.path, 'c.ts'))).toBe(true)
    expect(git(shared, 'status', '--porcelain')).toBe('')
    expect(git(shared, 'stash', 'list')).toBe('')
  })

  it('refuses to move changes from a folder that is on another branch', async () => {
    const { workspaces } = setup()
    writeFileSync(join(shared, 'a.ts'), 'other work\n')
    await expect(workspaces.create(ref, shared, { branch: 'feature', headSha }, true)).rejects.toThrow('not on this merge request\'s branch')
    expect(readFileSync(join(shared, 'a.ts'), 'utf8')).toBe('other work\n')
  })
})
