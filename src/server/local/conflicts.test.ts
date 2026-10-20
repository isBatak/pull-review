import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inspectConflicts, pushSynced, syncWithTarget, undoSync } from './conflicts'
import { createGitTools } from './git'
import { createNodeLocalHost } from './node-host'

const ref = { host: 'gitlab.example.com', project: 'group/project', iid: 1 }
const host = createNodeLocalHost()
const onProgress = () => {}

describe('bringing a merge request up to date with its target branch', () => {
  let root: string
  let work: string
  let remote: string
  let headSha: string
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const mr = () => ({ branch: 'feature', headSha })

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pull-review-conflicts-'))
    remote = join(root, 'remote.git')
    work = join(root, 'work')
    execFileSync('git', ['init', '--quiet', '--bare', remote])
    execFileSync('git', ['init', '--quiet', '-b', 'feature', work])
    git(work, 'config', 'user.email', 'test@example.com')
    git(work, 'config', 'user.name', 'Test')
    git(work, 'config', 'core.hooksPath', join(root, 'hooks'))
    git(work, 'remote', 'add', 'origin', 'git@gitlab.example.com:group/project.git')
    git(work, 'config', `url.${remote}.insteadOf`, 'git@gitlab.example.com:group/project.git')
    writeFileSync(join(work, 'a.ts'), 'start\n')
    git(work, 'add', '.')
    git(work, 'commit', '--quiet', '-m', 'start')
    git(work, 'push', '--quiet', 'origin', 'HEAD:refs/heads/develop')

    git(work, 'checkout', '--quiet', '-b', 'develop-work')
    writeFileSync(join(work, 'a.ts'), 'develop\n')
    writeFileSync(join(work, 'b.ts'), 'b\n')
    git(work, 'commit', '--quiet', '-am', 'develop change')
    git(work, 'add', 'b.ts')
    git(work, 'commit', '--quiet', '-m', 'add b')
    git(work, 'push', '--quiet', 'origin', 'HEAD:refs/heads/develop')

    git(work, 'checkout', '--quiet', 'feature')
    writeFileSync(join(work, 'a.ts'), 'feature\n')
    git(work, 'commit', '--quiet', '-am', 'feature change')
    git(work, 'push', '--quiet', 'origin', 'HEAD:refs/heads/feature')
    headSha = git(work, 'rev-parse', 'HEAD')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('lists conflicts without touching the folder', async () => {
    const report = await inspectConflicts(createGitTools(host), ref, work, mr(), 'develop', 'rebase')

    expect(report).toEqual({
      target: 'develop',
      behind: 2,
      strategy: 'rebase',
      files: [{ path: 'a.ts', hunks: [{ line: 1, ours: ['feature'], theirs: ['develop'] }] }],
    })
    expect(git(work, 'rev-parse', 'HEAD')).toBe(headSha)
    expect(git(work, 'status', '--porcelain')).toBe('')
  })

  it('rebases, lets Claude fix the conflict, and pushes with a lease', async () => {
    const tools = createGitTools(host)
    const seen: string[] = []
    const result = await syncWithTarget(host, tools, ref, work, {
      mr: mr(),
      target: 'develop',
      strategy: 'rebase',
      onProgress,
      resolve: async ({ files, commitSubject }) => {
        seen.push(`${commitSubject}: ${files.map(file => file.path).join(',')}`)
        return [{ path: 'a.ts', content: 'develop and feature\n', explanation: 'Kept both.' }]
      },
    })

    expect(seen).toEqual(['feature change: a.ts'])
    expect(readFileSync(join(work, 'a.ts'), 'utf8')).toBe('develop and feature\n')
    expect(existsSync(join(work, 'b.ts'))).toBe(true)
    expect(git(work, 'log', '--format=%s', '-3')).toBe('feature change\nadd b\ndevelop change')
    expect(result.files).toEqual([expect.objectContaining({ path: 'a.ts', explanation: 'Kept both.' })])
    expect(result.files[0]!.diff).toContain('+develop and feature')

    await pushSynced(tools, ref, work, mr(), { strategy: 'rebase', oldHead: headSha, newHead: result.newHead })
    expect(git(remote, 'rev-parse', 'refs/heads/feature')).toBe(result.newHead)
  })

  it('merges the target in for projects that use merge commits', async () => {
    const tools = createGitTools(host)
    const result = await syncWithTarget(host, tools, ref, work, {
      mr: mr(),
      target: 'develop',
      strategy: 'merge',
      onProgress,
      resolve: async () => [{ path: 'a.ts', content: 'merged\n', explanation: 'Merged.' }],
    })

    expect(git(work, 'rev-parse', 'HEAD^1')).toBe(headSha)
    expect(readFileSync(join(work, 'a.ts'), 'utf8')).toBe('merged\n')
    await pushSynced(tools, ref, work, mr(), { strategy: 'merge', oldHead: headSha, newHead: result.newHead })
    expect(git(remote, 'rev-parse', 'refs/heads/feature')).toBe(result.newHead)
  })

  it('refuses to push over commits that reached GitLab in the meantime', async () => {
    const tools = createGitTools(host)
    const result = await syncWithTarget(host, tools, ref, work, {
      mr: mr(),
      target: 'develop',
      strategy: 'rebase',
      onProgress,
      resolve: async () => [{ path: 'a.ts', content: 'fixed\n', explanation: '' }],
    })
    const other = join(root, 'other')
    execFileSync('git', ['clone', '--quiet', '--branch', 'feature', remote, other])
    git(other, 'config', 'user.email', 'test@example.com')
    git(other, 'config', 'user.name', 'Test')
    writeFileSync(join(other, 'c.ts'), 'c\n')
    git(other, 'add', '.')
    git(other, 'commit', '--quiet', '-m', 'someone else')
    git(other, 'push', '--quiet', 'origin', 'feature')
    const theirs = git(other, 'rev-parse', 'HEAD')

    await expect(pushSynced(tools, ref, work, mr(), { strategy: 'rebase', oldHead: headSha, newHead: result.newHead })).rejects.toThrow('Nothing was overwritten')
    expect(git(remote, 'rev-parse', 'refs/heads/feature')).toBe(theirs)
  })

  it('puts the folder back when the fix fails or is undone', async () => {
    const tools = createGitTools(host)
    await expect(syncWithTarget(host, tools, ref, work, {
      mr: mr(),
      target: 'develop',
      strategy: 'rebase',
      onProgress,
      resolve: async () => {
        throw new Error('Claude gave up')
      },
    })).rejects.toThrow('Claude gave up')
    expect(git(work, 'rev-parse', 'HEAD')).toBe(headSha)
    expect(git(work, 'status', '--porcelain')).toBe('')
    expect(existsSync(join(work, '.git', 'rebase-merge'))).toBe(false)

    const result = await syncWithTarget(host, tools, ref, work, {
      mr: mr(),
      target: 'develop',
      strategy: 'rebase',
      onProgress,
      resolve: async () => [{ path: 'a.ts', content: 'fixed\n', explanation: '' }],
    })
    await undoSync(tools, ref, work, { oldHead: headSha, newHead: result.newHead })
    expect(git(work, 'rev-parse', 'HEAD')).toBe(headSha)
  })

  it('will not start on a folder with local work', async () => {
    writeFileSync(join(work, 'a.ts'), 'unsaved\n')
    await expect(syncWithTarget(host, createGitTools(host), ref, work, {
      mr: mr(),
      target: 'develop',
      strategy: 'rebase',
      onProgress,
      resolve: async () => [],
    })).rejects.toThrow('uncommitted changes')
  })
})
