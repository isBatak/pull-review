import type { FeedbackContext } from '../../shared/self-improve'
import type { SelfImproveService } from './service'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitTools } from '../local/git'
import { createNodeLocalHost } from '../local/node-host'
import { createSelfImproveService } from './service'

const FAKE_CLAUDE = `#!/bin/sh
printf '%s\\n' "$@" > "$FAKE_ARGS"
prompt=$(cat)
result() { printf '{"type":"result","subtype":"success","result":"%s"}\\n' "$1"; }
case "$prompt" in
  *"Change the page"*) printf 'changed\\n' > build/web/index.html; printf 'changed\\n' > source/src/web/main.tsx; result "I changed the page." ;;
  *"Break the script"*) printf 'export const a = (\\n' > build/web/assets/index.js; result "Done." ;;
  *"Ask me"*) result "Which button do you mean?" ;;
  *"Crash"*) echo boom >&2; exit 3 ;;
  *"Take your time"*) printf 'half\\n' > build/web/index.html; exec sleep 5 ;;
esac
`

const context: FeedbackContext = { appVersion: '1.0.0', page: null, viewport: null, theme: null, element: null, screenshot: null }

describe('the change runner', () => {
  let root: string
  let argsFile: string
  let service: SelfImproveService
  const overlayDir = () => join(root, 'overlay/1.0.0')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: overlayDir(), encoding: 'utf8' }).trim()

  function createService(claudePath: string | null) {
    const host = { ...createNodeLocalHost(), env: async () => ({ ...process.env as Record<string, string>, FAKE_ARGS: argsFile }) }
    return createSelfImproveService(host, createGitTools(host), { root: join(root, 'overlay'), version: '1.0.0', parts: [{ name: 'web', from: join(root, 'shipped') }] }, { claudePath: Promise.resolve(claudePath) })
  }

  async function request(text: string) {
    const change = await service.create({ request: text, context })
    await service.runQueue()
    return (await service.state()).changes.find(item => item.id === change.id)!
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pull-review-runner-'))
    argsFile = join(root, 'args.txt')
    mkdirSync(join(root, 'shipped/assets'), { recursive: true })
    writeFileSync(join(root, 'shipped/index.html'), 'shipped\n')
    writeFileSync(join(root, 'shipped/assets/index.js'), 'export const a = 1\n')
    writeFileSync(join(root, 'shipped/assets/index.js.map'), JSON.stringify({ version: 3, sources: ['src/web/main.tsx'], sourcesContent: ['export const a = 1\n'], names: [], mappings: 'AAAA' }))
    writeFileSync(join(root, 'claude'), FAKE_CLAUDE)
    chmodSync(join(root, 'claude'), 0o755)
    service = createService(join(root, 'claude'))
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('commits a change, turns local changes on and keeps Claude\'s summary', async () => {
    const change = await request('Change the page')
    expect(change).toMatchObject({ status: 'ready', summary: 'I changed the page.', error: null })
    expect(change.commits).toEqual([git('rev-parse', 'HEAD')])
    expect(git('log', '-1', '--format=%s')).toBe('Change the page')
    expect(git('show', '--name-only', '--format=', 'HEAD').split('\n').sort()).toEqual(['build/web/index.html', 'source/src/web/main.tsx'])
    expect((await service.state()).active).toBe(true)

    const args = readFileSync(argsFile, 'utf8').split('\n')
    expect(args).toContain('acceptEdits')
    expect(args[args.indexOf('--session-id') + 1]).toBe(change.sessionId)
    expect(args[args.indexOf('--add-dir') + 1]).toBe(join(root, 'overlay/attachments', change.id))
    expect(existsSync(join(root, 'overlay/attachments', change.id, 'prompt.txt'))).toBe(false)
  })

  it('throws away a change with a syntax error', async () => {
    const change = await request('Break the script')
    expect(change.status).toBe('needs-you')
    expect(change.error).toMatch(/^build\/web\/assets\/index\.js has a syntax error:/)
    expect(readFileSync(join(overlayDir(), 'build/web/assets/index.js'), 'utf8')).toBe('export const a = 1\n')
    expect(change.commits).toEqual([])
  })

  it('passes Claude\'s question to the user when nothing changed', async () => {
    expect(await request('Ask me first')).toMatchObject({ status: 'needs-you', summary: 'Which button do you mean?', error: null, commits: [] })
  })

  it('reports a crash', async () => {
    expect((await request('Crash')).error).toBe('Claude Code exited with code 3: boom')
  })

  it('says when Claude Code is missing', async () => {
    service = createService(null)
    expect((await request('Change the page')).error).toBe('Claude Code is not installed.')
  })

  it('stops a running request and drops its edits', async () => {
    const change = await service.create({ request: 'Take your time', context })
    for (let tries = 0; tries < 100 && !existsSync(join(overlayDir(), '.git')); tries++)
      await new Promise(resolve => setTimeout(resolve, 50))
    await new Promise(resolve => setTimeout(resolve, 300))
    expect((await service.state()).run?.changeId).toBe(change.id)
    await service.dismiss(change.id)
    await service.runQueue()
    const state = await service.state()
    expect(state.changes[0]?.status).toBe('dismissed')
    expect(state.run).toBeNull()
    expect(readFileSync(join(overlayDir(), 'build/web/index.html'), 'utf8')).toBe('shipped\n')
  })

  it('picks up requests that were running when the app quit, for this version only', async () => {
    const change = await service.create({ request: 'Change the page', context })
    await service.runQueue()
    await service.updateChanges((changes) => {
      changes[0]!.status = 'working'
      changes.push({ ...changes[0]!, id: 'old', status: 'queued', version: '0.9.0' })
    })
    service = createService(join(root, 'claude'))
    await service.start()
    const changes = (await service.state()).changes
    expect(changes.find(item => item.id === change.id)?.status).toBe('needs-you')
    expect(changes.find(item => item.id === 'old')?.status).toBe('queued')
  })
})
