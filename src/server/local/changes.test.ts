import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { discardLocalChanges, parsePorcelainStatus, readLocalChanges, splitPatchByFile } from './changes'
import { createGitTools } from './git'
import { createNodeLocalHost } from './node-host'

const ref = { host: 'gitlab.example.com', project: 'group/project', iid: 1 }

describe('parsePorcelainStatus', () => {
  it('reads modified, untracked and renamed entries', () => {
    expect(parsePorcelainStatus(' M a.ts\0?? new.ts\0R  b.ts\0old-b.ts\0')).toEqual([
      { code: ' M', path: 'a.ts', previousPath: null },
      { code: '??', path: 'new.ts', previousPath: null },
      { code: 'R ', path: 'b.ts', previousPath: 'old-b.ts' },
    ])
  })
})

describe('splitPatchByFile', () => {
  it('keys each file diff by its path, including added and deleted files', () => {
    const patch = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-x\n+y\ndiff --git a/gone.ts b/gone.ts\n--- a/gone.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-z\n'
    expect([...splitPatchByFile(patch).keys()]).toEqual(['a.ts', 'gone.ts'])
  })
})

describe('local changes in a real repository', () => {
  let dir: string
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pull-review-changes-'))
    git('init', '--quiet')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    git('remote', 'add', 'origin', 'git@gitlab.example.com:group/project.git')
    writeFileSync(join(dir, 'kept.ts'), 'one\ntwo\n')
    writeFileSync(join(dir, 'other.ts'), 'a\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'start')
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('lists changed and new files with their diffs, then discards only what was asked', async () => {
    const host = createNodeLocalHost()
    const tools = createGitTools(host)
    writeFileSync(join(dir, 'kept.ts'), 'one\nTWO\n')
    writeFileSync(join(dir, 'other.ts'), 'b\n')
    writeFileSync(join(dir, 'new.ts'), 'fresh\n')

    const changes = await readLocalChanges(tools, ref, dir)
    expect(changes.files.map(file => [file.path, file.status, file.additions, file.deletions])).toEqual([
      ['kept.ts', 'modified', 1, 1],
      ['other.ts', 'modified', 1, 1],
      ['new.ts', 'added', 1, 0],
    ])
    expect(changes.files[0]!.diff).toContain('+TWO')

    await discardLocalChanges(host, tools, ref, dir, ['kept.ts', 'new.ts'])
    expect(readFileSync(join(dir, 'kept.ts'), 'utf8')).toBe('one\ntwo\n')
    expect(existsSync(join(dir, 'new.ts'))).toBe(false)
    expect(readFileSync(join(dir, 'other.ts'), 'utf8')).toBe('b\n')

    await expect(discardLocalChanges(host, tools, ref, dir, ['kept.ts'])).rejects.toThrow('no local changes')
    await discardLocalChanges(host, tools, ref, dir, null)
    expect((await readLocalChanges(tools, ref, dir)).files).toEqual([])
  })
})
