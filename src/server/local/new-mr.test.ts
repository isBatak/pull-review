import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitTools } from './git'
import { pushBranch, readBranchStatus, readDraftInput } from './new-mr'
import { createNodeLocalHost } from './node-host'

const ref = { host: 'gitlab.example.com', project: 'group/project' }
const tools = createGitTools(createNodeLocalHost())

describe('a branch without a merge request', () => {
  let root: string
  let work: string
  let remote: string
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pull-review-new-mr-'))
    remote = join(root, 'remote.git')
    work = join(root, 'work')
    execFileSync('git', ['init', '--quiet', '--bare', remote])
    execFileSync('git', ['init', '--quiet', '-b', 'develop', work])
    git(work, 'config', 'user.email', 'test@example.com')
    git(work, 'config', 'user.name', 'Test')
    git(work, 'remote', 'add', 'origin', 'git@gitlab.example.com:group/project.git')
    git(work, 'config', `url.${remote}.insteadOf`, 'git@gitlab.example.com:group/project.git')
    writeFileSync(join(work, 'a.ts'), 'a\n')
    git(work, 'add', '.')
    git(work, 'commit', '--quiet', '-m', 'start')
    git(work, 'push', '--quiet', 'origin', 'develop')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  function addCommits() {
    git(work, 'checkout', '--quiet', '-b', 'EN-1-filters')
    writeFileSync(join(work, 'b.ts'), 'b\n')
    git(work, 'add', '.')
    git(work, 'commit', '--quiet', '-m', 'feat: add filters', '-m', 'First filters.')
    writeFileSync(join(work, 'a.ts'), 'A\n')
    git(work, 'commit', '--quiet', '-am', 'fix: tidy a')
  }

  it('finds nothing to offer on the target branch or a branch with no new commits', async () => {
    expect(await readBranchStatus(tools, ref, work, 'develop')).toBeNull()
    git(work, 'checkout', '--quiet', '-b', 'empty')
    expect(await readBranchStatus(tools, ref, work, 'develop')).toBeNull()
  })

  it('describes the commits ahead of the target and uncommitted files', async () => {
    addCommits()
    writeFileSync(join(work, 'c.ts'), 'c\n')

    const status = await readBranchStatus(tools, ref, work, 'develop')

    expect(status).toMatchObject({ branch: 'EN-1-filters', target: 'develop', ahead: 2, uncommitted: 1 })
    expect(status!.commits.map(commit => commit.subject)).toEqual(['feat: add filters', 'fix: tidy a'])
  })

  it('gathers what Claude needs for the title', async () => {
    addCommits()
    const input = await readDraftInput(tools, ref, work, 'develop')
    expect(input.commits).toEqual([{ subject: 'feat: add filters', body: 'First filters.' }, { subject: 'fix: tidy a', body: '' }])
    expect(input.diffStat).toContain('b.ts')
  })

  it('pushes the branch, and refuses when the folder switched branches', async () => {
    addCommits()
    await pushBranch(tools, ref, work, 'EN-1-filters')
    expect(git(remote, 'rev-parse', 'refs/heads/EN-1-filters')).toBe(git(work, 'rev-parse', 'HEAD'))

    git(work, 'checkout', '--quiet', 'develop')
    await expect(pushBranch(tools, ref, work, 'EN-1-filters')).rejects.toThrow('Nothing was pushed')
  })
})
