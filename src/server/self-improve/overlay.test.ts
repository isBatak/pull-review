import type { OverlayStore } from './overlay'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitTools } from '../local/git'
import { createNodeLocalHost } from '../local/node-host'
import { createOverlayStore } from './overlay'

describe('the overlay store', () => {
  let root: string
  let overlay: OverlayStore
  const git = (...args: string[]) => execFileSync('git', args, { cwd: overlay.dir, encoding: 'utf8' }).trim()
  const read = (path: string) => readFileSync(join(overlay.dir, path), 'utf8')

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pull-review-overlay-'))
    const web = join(root, 'shipped/frontend')
    const backend = join(root, 'shipped/src')
    mkdirSync(join(web, 'assets'), { recursive: true })
    mkdirSync(backend, { recursive: true })
    writeFileSync(join(web, 'index.html'), '<script src="./assets/index.js"></script>\n')
    writeFileSync(join(web, 'assets/index.js'), 'console.log("app")\n')
    writeFileSync(join(web, 'assets/index.js.map'), JSON.stringify({
      version: 3,
      sources: ['src/web/main.tsx', 'node_modules/react/index.js'],
      sourcesContent: ['export const app = 1\n', null],
      names: [],
      mappings: 'AAAA',
    }))
    writeFileSync(join(backend, 'main.js'), 'export const api = {}\n')
    writeFileSync(join(backend, 'main.js.map'), JSON.stringify({ version: 3, sources: ['src/tiny/main.ts', 'src/web/main.tsx'], sourcesContent: ['export const api = {}\n', 'export const app = 1\n'], names: [], mappings: 'AAAA' }))
    const host = createNodeLocalHost()
    overlay = createOverlayStore(host, createGitTools(host), {
      root: join(root, 'overlay'),
      version: '1.2.3',
      parts: [{ name: 'app-web', from: web }, { name: 'app-backend', from: backend }],
    })
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('copies the shipped build and rebuilds the app\'s own source from the maps', async () => {
    await overlay.ensure()
    expect(read('build/app-web/index.html')).toContain('index.js')
    expect(read('build/app-backend/main.js')).toBe('export const api = {}\n')
    expect(read('source/src/web/main.tsx')).toBe('export const app = 1\n')
    expect(read('source/src/tiny/main.ts')).toBe('export const api = {}\n')
    expect(existsSync(join(overlay.dir, 'source/node_modules'))).toBe(false)
    expect(git('log', '--format=%s')).toBe('Shipped build 1.2.3')
    expect(git('tag')).toBe('shipped')
    expect(existsSync(`${overlay.dir}.partial`)).toBe(false)
  })

  it('leaves an existing overlay alone', async () => {
    await overlay.ensure()
    writeFileSync(join(overlay.dir, 'source/src/web/main.tsx'), 'export const app = 2\n')
    await overlay.commit('Change the app')
    await overlay.ensure()
    expect(git('log', '--format=%s')).toBe('Change the app\nShipped build 1.2.3')
  })

  it('commits each change and keeps its own bookkeeping out of git', async () => {
    await overlay.ensure()
    writeFileSync(join(overlay.dir, 'changes.json'), '[]')
    mkdirSync(join(overlay.dir, 'attachments/a'), { recursive: true })
    writeFileSync(join(overlay.dir, 'attachments/a/shot.png'), 'png')
    expect(await overlay.commit('Nothing yet')).toBeNull()

    writeFileSync(join(overlay.dir, 'build/app-web/assets/index.js'), 'console.log("changed")\n')
    const sha = await overlay.commit('Change the log line')
    expect(sha).toBe(git('rev-parse', 'HEAD'))
    expect(git('show', '--name-only', '--format=', 'HEAD')).toBe('build/app-web/assets/index.js')
  })

  it('reverts changes in reverse order and stops cleanly on a conflict', async () => {
    await overlay.ensure()
    const file = join(overlay.dir, 'source/src/web/main.tsx')
    writeFileSync(file, 'export const app = 2\n')
    const first = (await overlay.commit('Two'))!
    writeFileSync(file, 'export const app = 3\n')
    const second = (await overlay.commit('Three'))!

    expect(await overlay.revert([first])).toMatchObject({ ok: false })
    expect(git('status', '--porcelain')).toBe('')

    expect(await overlay.revert([first, second])).toEqual({ ok: true })
    expect(read('source/src/web/main.tsx')).toBe('export const app = 1\n')
  })

  it('discards work in progress and resets to the shipped build', async () => {
    await overlay.ensure()
    writeFileSync(join(overlay.dir, 'source/src/web/main.tsx'), 'export const app = 2\n')
    await overlay.commit('Two')
    writeFileSync(join(overlay.dir, 'source/src/web/new.ts'), 'new\n')
    writeFileSync(join(overlay.dir, 'build/app-web/index.html'), 'broken')
    expect(await overlay.changedFiles()).toEqual(['build/app-web/index.html', 'source/src/web/new.ts'])

    await overlay.discard()
    expect(await overlay.changedFiles()).toEqual([])
    expect(read('source/src/web/main.tsx')).toBe('export const app = 2\n')

    await overlay.reset()
    expect(read('source/src/web/main.tsx')).toBe('export const app = 1\n')
  })

  it('is active only for its own version', async () => {
    expect(await overlay.isActive()).toBe(false)
    await overlay.setActive(true)
    expect(await overlay.isActive()).toBe(false)
    await overlay.ensure()
    expect(await overlay.isActive()).toBe(true)
    await overlay.setActive(false)
    expect(await overlay.isActive()).toBe(false)
  })
})
