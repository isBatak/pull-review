import type { FeedbackContext } from '../../shared/self-improve'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitTools } from '../local/git'
import { createNodeLocalHost } from '../local/node-host'
import { createSelfImproveService } from './service'

const FAKE_CLAUDE = `#!/bin/sh
prompt=$(cat)
printf '%s' "$prompt" > "$PROMPT_LOG"
case "$prompt" in
  *"bring the change over"*) printf 'replayed\\n' >> build/web/index.html; printf '{"type":"result","subtype":"success","result":"Moved."}\\n' ;;
  *) sed -i '' 's/a = 1$/a = 10/' source/src/web/main.tsx; printf 'changed\\n' >> build/web/index.html; printf '{"type":"result","subtype":"success","result":"Done."}\\n' ;;
esac
`

const context: FeedbackContext = { appVersion: '1.0.0', page: null, viewport: null, theme: null, element: null, screenshot: null }

describe('moving local changes to a new version', () => {
  let root: string
  const overlayRoot = () => join(root, 'overlay')
  const read = (path: string) => readFileSync(join(overlayRoot(), path), 'utf8')

  function shipped(version: string, source: string) {
    const dir = join(root, `shipped-${version}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), `shipped ${version}\n`)
    writeFileSync(join(dir, 'index.js.map'), JSON.stringify({ version: 3, sources: ['src/web/main.tsx'], sourcesContent: [source], names: [], mappings: 'AAAA' }))
    return dir
  }

  function service(version: string, source: string) {
    const host = { ...createNodeLocalHost(), cacheDir: join(root, 'cache'), env: async () => ({ ...process.env as Record<string, string>, PROMPT_LOG: join(root, 'prompt.txt') }) }
    return createSelfImproveService(host, createGitTools(host), { root: overlayRoot(), version, parts: [{ name: 'web', from: shipped(version, source) }] }, {
      claudePath: Promise.resolve(join(root, 'claude')),
      gh: Promise.resolve(null),
    })
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pull-review-replay-'))
    writeFileSync(join(root, 'claude'), FAKE_CLAUDE)
    chmodSync(join(root, 'claude'), 0o755)
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('applies the old source diff on the new version and lets Claude redo the build part', async () => {
    const old = service('1.0.0', 'export const a = 1\nexport const b = 2\n')
    const made = await old.create({ request: 'Make a ten', context })
    await old.runQueue()

    const next = service('1.1.0', 'export const a = 1\nexport const b = 2\nexport const c = 3\n')
    await next.start()
    const moved = (await next.state()).changes.find(change => change.id === made.id)!
    expect(moved).toMatchObject({ status: 'ready', version: '1.1.0', replay: null, summary: 'Moved.', needsReload: true })
    expect(moved.commits).toHaveLength(1)
    expect(read('1.1.0/source/src/web/main.tsx')).toBe('export const a = 10\nexport const b = 2\nexport const c = 3\n')
    expect(read('1.1.0/build/web/index.html')).toBe('shipped 1.1.0\nreplayed\n')
    expect(readFileSync(join(root, 'prompt.txt'), 'utf8')).toMatch(/^The user made this change on version 1\.0\.0\. The app has since updated to 1\.1\.0.*it has already been applied to source\/ here/s)
    expect(existsSync(join(overlayRoot(), '1.0.0/.migrated'))).toBe(true)
  })

  it('asks Claude to redo both sides when the old diff no longer fits', async () => {
    const old = service('1.0.0', 'export const a = 1\n')
    await old.create({ request: 'Make a ten', context })
    await old.runQueue()

    const next = service('1.1.0', 'export const a = 2\n')
    await next.start()
    expect(readFileSync(join(root, 'prompt.txt'), 'utf8')).toContain('did not apply to this version\'s source')
    expect(read('1.1.0/source/src/web/main.tsx')).toBe('export const a = 2\n')
  })

  it('moves waiting and broken requests without replaying them', async () => {
    const old = service('1.0.0', 'export const a = 1\n')
    const broken = await old.create({ request: 'Make a ten', context })
    await old.runQueue()
    await old.updateChanges((changes) => {
      changes[0]!.status = 'broke-app'
      changes.push({ ...changes[0]!, id: 'asked', status: 'needs-you', summary: 'Which one?', commits: [], sessionId: 'old-session' })
      changes.push({ ...changes[0]!, id: 'gone', status: 'dismissed' })
    })

    const next = service('1.1.0', 'export const a = 1\n')
    const statuses = async () => Object.fromEntries((await next.state()).changes.map(change => [change.id, [change.status, change.version]]))
    await next.start()
    expect(await statuses()).toEqual({
      [broken.id]: ['needs-you', '1.1.0'],
      asked: ['needs-you', '1.1.0'],
      gone: ['dismissed', '1.0.0'],
    })
    expect((await next.state()).changes.find(change => change.id === 'asked')?.sessionId).toBeNull()
    expect((await next.state()).changes[0]!.error).toBe('This change broke the app on 1.0.0, so it did not move to 1.1.0. Try again to make it from the request, or dismiss it.')
  })

  it('deletes old overlays 30 days after their changes moved', async () => {
    const next = service('1.1.0', 'export const a = 1\n')
    for (const [version, movedAt] of [['1.0.0', '2026-09-01T00:00:00.000Z'], ['1.0.1', '2026-11-01T00:00:00.000Z'], ['1.0.2', null]] as const) {
      mkdirSync(join(overlayRoot(), version), { recursive: true })
      if (movedAt)
        writeFileSync(join(overlayRoot(), version, '.migrated'), movedAt)
    }
    await next.removeOldOverlays(Date.parse('2026-11-05T00:00:00.000Z'))
    expect(['1.0.0', '1.0.1', '1.0.2'].map(version => existsSync(join(overlayRoot(), version)))).toEqual([false, true, true])
  })
})
