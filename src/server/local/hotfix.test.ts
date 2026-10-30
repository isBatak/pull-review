import type { HotfixInput } from '../../shared/hotfix'
import type { HotfixRunner } from './hotfix'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitTools } from './git'
import { createHotfixRunner } from './hotfix'
import { createNodeLocalHost } from './node-host'

const ref = { host: 'gitlab.example.com', project: 'group/project' }

describe('a hotfix from a stable tag', () => {
  let root: string
  let work: string
  let remote: string
  let fix: string
  let hotfixes: HotfixRunner
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const start = (commits: string[]): HotfixInput => ({ tag: 'stable-app-0.193.0', commits, version: '0.193.0-1', packageDir: 'apps/frontend/app' })

  function commitFile(path: string, text: string, message: string) {
    writeFileSync(join(work, path), text)
    git(work, 'add', '.')
    git(work, 'commit', '--quiet', '-m', message)
    return git(work, 'rev-parse', 'HEAD')
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pull-review-hotfix-'))
    remote = join(root, 'remote.git')
    work = join(root, 'work')
    const host = { ...createNodeLocalHost(), cacheDir: join(root, 'cache') }
    hotfixes = createHotfixRunner(host, createGitTools(host))
    execFileSync('git', ['init', '--quiet', '--bare', remote])
    execFileSync('git', ['init', '--quiet', '-b', 'develop', work])
    git(work, 'config', 'user.email', 'test@example.com')
    git(work, 'config', 'user.name', 'Test')
    git(work, 'remote', 'add', 'origin', 'git@gitlab.example.com:group/project.git')
    git(work, 'config', `url.${remote}.insteadOf`, 'git@gitlab.example.com:group/project.git')
    mkdirSync(join(work, 'apps/frontend/app'), { recursive: true })
    writeFileSync(join(work, 'apps/frontend/app/package.json'), `${JSON.stringify({ name: 'app', version: '0.193.0' }, null, 2)}\n`)
    commitFile('a.ts', 'a\n', 'start')
    git(work, 'tag', 'stable-app-0.193.0')
    commitFile('feature.ts', 'not for the hotfix\n', 'feature')
    fix = commitFile('a.ts', 'fixed\n', 'fix: the bug')
    git(work, 'push', '--quiet', 'origin', 'develop', 'stable-app-0.193.0')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  async function runUntil(input: HotfixInput, lastStep?: string) {
    const plan = await hotfixes.plan(ref, work, input)
    for (const step of plan.steps) {
      const result = await hotfixes.run(ref, work, plan.input, step.id)
      if (step.id === lastStep || result.conflicts)
        return { plan, result }
    }
    return { plan, result: null }
  }

  it('cherry-picks onto the tag, sets the version and pushes the release candidate tag', async () => {
    await runUntil(start([fix]))

    expect(git(remote, 'tag', '--list', 'rc-*')).toBe('rc-app-0.193.0-1')
    expect(git(remote, 'log', '--format=%s', '-3', 'rc-app-0.193.0-1').split('\n')).toEqual(['[APP 0.193.0-1] chore: version packages', 'fix: the bug', 'start'])
    expect(git(remote, 'log', '-1', '--format=%b', 'rc-app-0.193.0-1~1')).toContain(`(cherry picked from commit ${fix})`)
    expect(JSON.parse(git(remote, 'show', 'rc-app-0.193.0-1:apps/frontend/app/package.json')).version).toBe('0.193.0-1')
    expect(git(work, 'symbolic-ref', '--short', 'HEAD')).toBe('develop')
    expect(readFileSync(join(work, 'a.ts'), 'utf8')).toBe('fixed\n')
    expect(await hotfixes.active(ref, work)).toBeNull()
  }, 30_000)

  it('drops records of folders that no longer exist', async () => {
    const gone = join(root, 'gone')
    mkdirSync(join(root, 'cache'), { recursive: true })
    writeFileSync(join(root, 'cache/hotfixes.json'), JSON.stringify({ [gone]: start([fix]) }))
    await runUntil(start([fix]), 'checkout')

    expect(Object.keys(JSON.parse(readFileSync(join(root, 'cache/hotfixes.json'), 'utf8')))).toEqual([work])
  }, 30_000)

  it('refuses to start while tracked files have changes', async () => {
    writeFileSync(join(work, 'a.ts'), 'my own edit\n')
    await expect(hotfixes.plan(ref, work, start([fix]))).rejects.toThrow(/not committed/)
  })

  it('refuses unsafe input before touching git', async () => {
    await expect(hotfixes.plan(ref, work, start(['--exec=rm']))).rejects.toThrow(/commit ID/)
  })

  it('picks up a half done hotfix with the steps that are already done', async () => {
    await runUntil(start([fix]), 'version')

    const progress = await hotfixes.active(ref, work)
    expect(progress?.plan.input.returnTo).toBe('develop')
    expect(progress?.done).toEqual(['fetch', 'checkout', `pick:${fix}`, 'version'])
    expect((await hotfixes.plan(ref, work, start([fix]))).rcTag).toBe('rc-app-0.193.0-1')
    await expect(hotfixes.plan(ref, work, { ...start([fix]), tag: 'stable-app-0.192.0', version: '0.192.0-1' })).rejects.toThrow(/stable-app-0.193.0 to rc-app-0.193.0-1 is still open/)
  }, 30_000)

  it('aborts a half done hotfix, drops its local tag and goes back to the branch', async () => {
    await runUntil(start([fix]), 'tag')

    expect(await hotfixes.abort(ref, work)).toEqual({ returnedTo: 'develop' })
    expect(git(work, 'symbolic-ref', '--short', 'HEAD')).toBe('develop')
    expect(git(work, 'status', '--porcelain')).toBe('')
    expect(git(work, 'tag', '--list', 'rc-*')).toBe('')
    expect(await hotfixes.active(ref, work)).toBeNull()
  }, 30_000)

  it('takes over a cherry-pick on the same tag that was started by hand', async () => {
    const followUp = commitFile('a.ts', 'fixed again\n', 'fix: the bug again')
    git(work, 'checkout', '--quiet', 'stable-app-0.193.0')
    expect(() => execFileSync('git', ['cherry-pick', '-x', followUp], { cwd: work, stdio: 'ignore' })).toThrow()

    await expect(hotfixes.plan(ref, work, start([fix]))).rejects.toThrow(/still cherry-picking/)
    expect((await hotfixes.plan(ref, work, start([followUp]))).input.returnTo).toBe('develop')
    expect((await hotfixes.active(ref, work))?.conflict).toEqual({ stepId: `pick:${followUp}`, files: [{ path: 'a.ts', tagDeleted: false, commitDeleted: false }] })
    expect(await hotfixes.abort(ref, work)).toEqual({ returnedTo: 'develop' })
    expect(git(work, 'symbolic-ref', '--short', 'HEAD')).toBe('develop')
  }, 30_000)

  it('does not take over a folder that is far past the tag', async () => {
    git(work, 'checkout', '--quiet', '--detach', 'develop')
    await expect(hotfixes.plan(ref, work, start([fix]))).resolves.toMatchObject({ input: { returnTo: null } })
    expect(await hotfixes.active(ref, work)).toBeNull()
  })

  describe('with a conflict', () => {
    let conflicting: string

    async function startConflict() {
      conflicting = commitFile('feature.ts', 'changed again\n', 'touch feature')
      git(work, 'push', '--quiet', 'origin', 'develop')
      const plan = await hotfixes.plan(ref, work, start([conflicting]))
      await hotfixes.run(ref, work, plan.input, 'fetch')
      await hotfixes.run(ref, work, plan.input, 'checkout')
      commitFile('feature.ts', 'already here\n', 'local')
      return hotfixes.run(ref, work, plan.input, `pick:${conflicting}`)
    }

    it('lists the conflicts and continues once each file has a side', async () => {
      const result = await startConflict()
      expect(result.conflicts).toEqual([{ path: 'feature.ts', tagDeleted: false, commitDeleted: false }])
      await expect(hotfixes.continuePick(ref, work)).rejects.toThrow(/Resolve these files first: feature.ts/)

      await hotfixes.resolve(ref, work, 'feature.ts', 'commit')
      expect(await hotfixes.conflicts(ref, work)).toEqual({ inProgress: true, files: [] })
      await hotfixes.continuePick(ref, work)

      expect(await hotfixes.conflicts(ref, work)).toEqual({ inProgress: false, files: [] })
      expect(readFileSync(join(work, 'feature.ts'), 'utf8')).toBe('changed again\n')
      expect(git(work, 'log', '-1', '--format=%s')).toBe('touch feature')
    }, 30_000)

    it('shows the open conflict when the hotfix is picked up again', async () => {
      await startConflict()
      const progress = await hotfixes.active(ref, work)
      expect(progress?.done).toEqual(['fetch', 'checkout'])
      expect(progress?.conflict).toEqual({ stepId: `pick:${conflicting}`, files: [{ path: 'feature.ts', tagDeleted: false, commitDeleted: false }] })
    }, 30_000)

    it('keeps conflict markers out of a file fixed by hand', async () => {
      await startConflict()
      await expect(hotfixes.resolve(ref, work, 'feature.ts', 'edited')).rejects.toThrow(/conflict markers/)
      writeFileSync(join(work, 'feature.ts'), 'merged by hand\n')
      await hotfixes.resolve(ref, work, 'feature.ts', 'edited')
      await hotfixes.continuePick(ref, work)
      expect(readFileSync(join(work, 'feature.ts'), 'utf8')).toBe('merged by hand\n')
    }, 30_000)

    it('aborts and goes back to the branch', async () => {
      await startConflict()
      await hotfixes.abort(ref, work)
      expect(git(work, 'symbolic-ref', '--short', 'HEAD')).toBe('develop')
      expect(git(work, 'status', '--porcelain')).toBe('')
    }, 30_000)
  })
})
