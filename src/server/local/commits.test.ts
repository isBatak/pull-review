import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readLocalChanges } from './changes'
import { commitLocalChanges, pushLocalCommits, readUnpushedCommit } from './commits'
import { createGitTools } from './git'
import { createNodeLocalHost } from './node-host'

const ref = { host: 'gitlab.example.com', project: 'group/project', iid: 1 }
const host = createNodeLocalHost()

describe('committing and pushing local changes', () => {
  let root: string
  let work: string
  let remote: string
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pull-review-commits-'))
    remote = join(root, 'remote.git')
    work = join(root, 'work')
    execFileSync('git', ['init', '--quiet', '--bare', remote])
    execFileSync('git', ['init', '--quiet', work])
    git(work, 'config', 'user.email', 'test@example.com')
    git(work, 'config', 'user.name', 'Test')
    git(work, 'config', 'core.hooksPath', join(root, 'hooks'))
    writeFileSync(join(work, 'a.ts'), 'a\n')
    writeFileSync(join(work, 'b.ts'), 'b\n')
    git(work, 'add', '.')
    git(work, 'commit', '--quiet', '-m', 'start')
    git(work, 'remote', 'add', 'origin', remote)
    git(work, 'push', '--quiet', 'origin', 'HEAD:refs/heads/feature')
    git(work, 'checkout', '--quiet', '--detach')
    git(work, 'remote', 'set-url', '--push', 'origin', remote)
    git(work, 'remote', 'set-url', 'origin', 'git@gitlab.example.com:group/project.git')
    git(work, 'remote', 'set-url', '--push', 'origin', remote)
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('makes one commit per planned group and pushes them to the branch', async () => {
    const tools = createGitTools(host)
    const headSha = git(work, 'rev-parse', 'HEAD')
    writeFileSync(join(work, 'a.ts'), 'A\n')
    writeFileSync(join(work, 'b.ts'), 'B\n')
    writeFileSync(join(work, 'c.ts'), 'c\n')

    const result = await commitLocalChanges(host, tools, ref, work, { branch: 'feature', headSha }, {
      commits: [{ message: 'fix: a', files: ['a.ts'] }, { message: 'feat: b and c', files: ['b.ts', 'c.ts'] }],
      push: true,
      skipHooks: false,
    })

    expect(result.pushError).toBeNull()
    expect(result.commits.map(commit => commit.subject)).toEqual(['fix: a', 'feat: b and c'])
    expect(git(remote, 'log', '--format=%s', 'feature')).toBe('feat: b and c\nfix: a\nstart')
    expect(git(remote, 'show', '--name-only', '--format=', 'feature~1')).toBe('a.ts')
    expect((await readLocalChanges(tools, ref, work, headSha)).files).toEqual([])
  })

  it('splits one file into several commits by hunk and leaves the working file as it was', async () => {
    const tools = createGitTools(host)
    const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`)
    writeFileSync(join(work, 'doc.md'), `${lines.join('\n')}\n`)
    git(work, 'add', 'doc.md')
    git(work, 'commit', '--quiet', '-m', 'add doc')
    const headSha = git(work, 'rev-parse', 'HEAD')
    const edited = [...lines]
    edited[1] = 'line 2, first fix'
    edited[25] = 'line 26, second fix'
    writeFileSync(join(work, 'doc.md'), `${edited.join('\n')}\n`)

    const result = await commitLocalChanges(host, tools, ref, work, { branch: 'feature', headSha }, {
      commits: [
        { message: 'docs: second fix', files: ['doc.md'], hunks: { 'doc.md': [1] } },
        { message: 'docs: first fix', files: ['doc.md'], hunks: { 'doc.md': [0] } },
      ],
      push: false,
      skipHooks: false,
    })

    expect(result.commits.map(commit => commit.subject)).toEqual(['docs: second fix', 'docs: first fix'])
    expect(git(work, 'show', '--format=', '-U0', 'HEAD~1')).toContain('+line 26, second fix')
    expect(git(work, 'show', '--format=', '-U0', 'HEAD~1')).not.toContain('first fix')
    expect(git(work, 'show', '--format=', '-U0', 'HEAD')).toContain('+line 2, first fix')
    expect((await readLocalChanges(tools, ref, work, headSha)).files).toEqual([])
  })

  it('shows the message and diff of an unpushed commit, and only of unpushed ones', async () => {
    const tools = createGitTools(host)
    const headSha = git(work, 'rev-parse', 'HEAD')
    writeFileSync(join(work, 'a.ts'), 'A\n')
    const [made] = (await commitLocalChanges(host, tools, ref, work, { branch: 'feature', headSha }, {
      commits: [{ message: 'fix: a\n\nBecause.', files: ['a.ts'] }],
      push: false,
      skipHooks: false,
    })).commits

    const details = await readUnpushedCommit(tools, ref, work, headSha, made!.sha)
    expect(details.message).toBe('fix: a\n\nBecause.')
    expect(details.files.map(file => file.path)).toEqual(['a.ts'])
    expect(details.files[0]!.diff).toContain('+A')
    await expect(readUnpushedCommit(tools, ref, work, headSha, headSha)).rejects.toThrow('not one of the unpushed commits')
  })

  it('refuses parts that no longer match the file', async () => {
    const tools = createGitTools(host)
    const headSha = git(work, 'rev-parse', 'HEAD')
    writeFileSync(join(work, 'a.ts'), 'A\n')
    await expect(commitLocalChanges(host, tools, ref, work, { branch: 'feature', headSha }, {
      commits: [{ message: 'fix: a', files: ['a.ts'], hunks: { 'a.ts': [3] } }],
      push: false,
      skipHooks: false,
    })).rejects.toThrow('changed since the plan')
    expect(git(work, 'log', '-1', '--format=%s')).toBe('start')
  })

  it('keeps commits local and reports it when the push is rejected, without overwriting', async () => {
    const tools = createGitTools(host)
    const headSha = git(work, 'rev-parse', 'HEAD')
    const other = join(root, 'other')
    execFileSync('git', ['clone', '--quiet', '--branch', 'feature', remote, other])
    git(other, 'config', 'user.email', 'o@example.com')
    git(other, 'config', 'user.name', 'Other')
    writeFileSync(join(other, 'b.ts'), 'someone else\n')
    git(other, 'commit', '--quiet', '-am', 'other change')
    git(other, 'push', '--quiet', 'origin', 'feature')

    writeFileSync(join(work, 'a.ts'), 'A\n')
    const result = await commitLocalChanges(host, tools, ref, work, { branch: 'feature', headSha }, { commits: [{ message: 'fix: a', files: ['a.ts'] }], push: true, skipHooks: false })

    expect(result.pushed).toBe(false)
    expect(result.pushError).toContain('newer commits')
    expect(git(remote, 'log', '-1', '--format=%s', 'feature')).toBe('other change')
    expect((await readLocalChanges(tools, ref, work, headSha)).unpushed.map(commit => commit.subject)).toEqual(['fix: a'])
    await expect(pushLocalCommits(tools, ref, work, { branch: 'feature', headSha })).rejects.toThrow('newer commits')
  })

  it('stops with the hook output when a commit hook fails, and leaves the files uncommitted', async () => {
    const tools = createGitTools(host)
    const headSha = git(work, 'rev-parse', 'HEAD')
    execFileSync('mkdir', ['-p', join(root, 'hooks')])
    writeFileSync(join(root, 'hooks', 'pre-commit'), '#!/bin/sh\necho "lint failed: missing semicolon"\nexit 1\n', { mode: 0o755 })
    writeFileSync(join(work, 'a.ts'), 'A\n')

    await expect(commitLocalChanges(host, tools, ref, work, { branch: 'feature', headSha }, { commits: [{ message: 'fix: a', files: ['a.ts'] }], push: true, skipHooks: false }))
      .rejects
      .toThrow('lint failed: missing semicolon')
    expect((await readLocalChanges(tools, ref, work, headSha)).files.map(file => file.path)).toEqual(['a.ts'])

    const skipped = await commitLocalChanges(host, tools, ref, work, { branch: 'feature', headSha }, { commits: [{ message: 'fix: a', files: ['a.ts'] }], push: false, skipHooks: true })
    expect(skipped.commits).toHaveLength(1)
  })
})
