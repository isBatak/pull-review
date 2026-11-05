import type { FeedbackContext, LocalChange } from '../../shared/self-improve'
import type { SelfImproveService } from './service'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitTools } from '../local/git'
import { createNodeLocalHost } from '../local/node-host'
import { createSelfImproveService } from './service'

const SOURCE = 'export const a = 1\nexport const b = 2\n'

const FAKE_CLAUDE = `#!/bin/sh
case "$(cat)" in
  *"eleven"*) sed -i '' 's/a = 10/a = 11/' source/src/web/main.tsx ;;
  *) sed -i '' 's/a = 1$/a = 10/' source/src/web/main.tsx ;;
esac
printf 'changed\\n' >> build/web/index.html
printf '{"type":"result","subtype":"success","result":"a is 10 now."}\\n'
`

const FAKE_GH = `#!/bin/sh
printf '%s\\n' "$*" >> "$GH_LOG"
case "$1 $2" in
  "auth status") exit 0 ;;
  "auth git-credential") exit 0 ;;
  "api user") echo "$GH_LOGIN" ;;
  "repo fork") exit 0 ;;
  "pr create") eval "body=\\\${$#}"; cat "$body" >> "$GH_LOG"; echo "https://github.com/isBatak/pull-review/pull/7" ;;
  "pr view") case "$*" in *mergeCommit*) echo "$MERGE_SHA" ;; *) echo "MERGED" ;; esac ;;
esac
`

const context: FeedbackContext = { appVersion: '1.0.0', page: null, viewport: null, theme: null, element: null, screenshot: null }

describe('sending a local change as a pull request', () => {
  let root: string
  let service: SelfImproveService
  let login: string
  let mergeSha: string
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const ghLog = () => readFileSync(join(root, 'gh.log'), 'utf8')

  function createService(gh: string | null, version = '1.0.0') {
    const host = { ...createNodeLocalHost(), cacheDir: join(root, 'cache'), env: async () => ({ ...process.env as Record<string, string>, GH_LOG: join(root, 'gh.log'), GH_LOGIN: login, MERGE_SHA: mergeSha }) }
    return createSelfImproveService(host, createGitTools(host), { root: join(root, 'overlay'), version, parts: [{ name: 'web', from: join(root, 'shipped') }] }, {
      claudePath: Promise.resolve(join(root, 'claude')),
      gh: Promise.resolve(gh),
      remoteUrl: repo => join(root, repo === 'isBatak/pull-review' ? 'upstream.git' : 'fork.git'),
    })
  }

  async function finishedChange(request = 'Make a ten') {
    const change = await service.create({ request, context })
    await service.runQueue()
    return (await service.state()).changes.find(item => item.id === change.id) as LocalChange
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pull-review-pr-'))
    login = 'tester'
    mergeSha = ''
    const work = join(root, 'work')
    mkdirSync(join(work, 'src/web'), { recursive: true })
    execFileSync('git', ['init', '--quiet', '-b', 'main', work])
    git(work, 'config', 'user.email', 'test@example.com')
    git(work, 'config', 'user.name', 'Test')
    writeFileSync(join(work, 'src/web/main.tsx'), SOURCE)
    writeFileSync(join(work, 'README.md'), 'hi\n')
    git(work, 'add', '.')
    git(work, 'commit', '--quiet', '-m', 'Release')
    git(work, 'tag', 'v1.0.0')
    execFileSync('git', ['clone', '--quiet', '--bare', work, join(root, 'upstream.git')])
    execFileSync('git', ['clone', '--quiet', '--bare', work, join(root, 'fork.git')])
    git(work, 'remote', 'add', 'origin', join(root, 'upstream.git'))

    mkdirSync(join(root, 'shipped'))
    writeFileSync(join(root, 'shipped/index.html'), 'shipped\n')
    writeFileSync(join(root, 'shipped/index.js.map'), JSON.stringify({ version: 3, sources: ['src/web/main.tsx'], sourcesContent: [SOURCE], names: [], mappings: 'AAAA' }))
    writeFileSync(join(root, 'claude'), FAKE_CLAUDE)
    writeFileSync(join(root, 'gh'), FAKE_GH)
    chmodSync(join(root, 'claude'), 0o755)
    chmodSync(join(root, 'gh'), 0o755)
    service = createService(join(root, 'gh'))
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('forks, pushes only the source change on top of main and opens a pull request', async () => {
    const change = await finishedChange()
    const sent = await service.sendPr(change.id)
    expect(sent.pr).toEqual({ number: 7, url: 'https://github.com/isBatak/pull-review/pull/7', branch: `self-improve/${change.id.slice(0, 8)}`, state: 'open' })

    const fork = join(root, 'fork.git')
    expect(git(fork, 'show', `${sent.pr!.branch}:src/web/main.tsx`)).toBe('export const a = 10\nexport const b = 2')
    expect(git(fork, 'show', '--name-only', '--format=%s', sent.pr!.branch)).toBe('Make a ten\n\nsrc/web/main.tsx')
    expect(git(fork, 'rev-parse', `${sent.pr!.branch}^`)).toBe(git(join(root, 'upstream.git'), 'rev-parse', 'main'))

    const log = ghLog()
    expect(log).toContain('repo fork isBatak/pull-review --clone=false --remote=false')
    expect(log).toMatch(/pr create --repo isBatak\/pull-review --base main --head tester:self-improve\/\w+ --title Make a ten --body-file /)
  })

  it('pushes straight to the repository for its owner', async () => {
    login = 'isBatak'
    service = createService(join(root, 'gh'))
    const change = await finishedChange()
    const sent = await service.sendPr(change.id)
    expect(git(join(root, 'upstream.git'), 'show', `${sent.pr!.branch}:src/web/main.tsx`)).toContain('a = 10')
    expect(ghLog()).not.toContain('repo fork')
    expect(ghLog()).toMatch(/--head self-improve\//)
  })

  it('falls back to the release tag when main changed the same lines', async () => {
    const work = join(root, 'work')
    writeFileSync(join(work, 'src/web/main.tsx'), 'export const a = 5\nexport const b = 2\n')
    git(work, 'commit', '--quiet', '-am', 'Change a on main')
    git(work, 'push', '--quiet', 'origin', 'main')

    const change = await finishedChange()
    const sent = await service.sendPr(change.id)
    expect(git(join(root, 'fork.git'), 'rev-parse', `${sent.pr!.branch}^`)).toBe(git(work, 'rev-parse', 'v1.0.0'))
    expect(ghLog()).toContain('Made on version 1.0.0. It did not apply to main as it is')
  })

  it('explains what to do without gh, and still hands out the patch', async () => {
    service = createService(null)
    const change = await finishedChange()
    await expect(service.sendPr(change.id)).rejects.toMatchObject({ problem: 'gh-missing' })
    const { patch, issueUrl } = await service.patch(change.id)
    expect(patch).toContain('--- a/src/web/main.tsx')
    expect(patch).toContain('+export const a = 10')
    expect(new URL(issueUrl).searchParams.get('body')).toContain('+export const a = 10')
  })

  it('updates the state of open pull requests', async () => {
    const change = await finishedChange()
    await service.sendPr(change.id)
    await service.refreshPrs()
    expect((await service.state()).changes[0]?.pr?.state).toBe('merged')
  })

  it('builds on the branch of an earlier change it depends on', async () => {
    const first = await finishedChange()
    const firstPr = (await service.sendPr(first.id)).pr!
    const second = await finishedChange('Make a eleven')
    const sent = await service.sendPr(second.id)
    const fork = join(root, 'fork.git')
    expect(git(fork, 'show', `${sent.pr!.branch}:src/web/main.tsx`)).toBe('export const a = 11\nexport const b = 2')
    expect(git(fork, 'rev-parse', `${sent.pr!.branch}^`)).toBe(git(fork, 'rev-parse', firstPr.branch))
    expect(ghLog()).toContain('Depends on #7, which this change builds on.')
  })

  it('marks a change as landed when its merged pull request is in the new release', async () => {
    const change = await finishedChange()
    await service.sendPr(change.id)
    await service.refreshPrs()

    const work = join(root, 'work')
    writeFileSync(join(work, 'src/web/main.tsx'), 'export const a = 10\nexport const b = 2\n')
    git(work, 'commit', '--quiet', '-am', 'Merge pull request #7')
    mergeSha = git(work, 'rev-parse', 'HEAD')
    git(work, 'tag', 'v1.1.0')
    git(work, 'push', '--quiet', 'origin', 'main', '--tags')

    const next = createService(join(root, 'gh'), '1.1.0')
    await next.start()
    expect((await next.state()).changes[0]).toMatchObject({ status: 'landed', version: '1.0.0', needsReload: false })
  })

  it('replays a merged change that is not in the new release yet', async () => {
    const change = await finishedChange()
    await service.sendPr(change.id)
    await service.refreshPrs()
    const work = join(root, 'work')
    git(work, 'tag', 'v1.1.0', 'v1.0.0')
    writeFileSync(join(work, 'later.txt'), 'later\n')
    git(work, 'add', '.')
    git(work, 'commit', '--quiet', '-m', 'Merge pull request #7 after the release')
    mergeSha = git(work, 'rev-parse', 'HEAD')
    git(work, 'push', '--quiet', 'origin', 'main', '--tags')

    const next = createService(join(root, 'gh'), '1.1.0')
    await next.start()
    expect((await next.state()).changes.find(item => item.id === change.id)).toMatchObject({ version: '1.1.0', replay: null, status: 'ready' })
  })
})
