import type { FeedbackContext } from '../../shared/self-improve'
import type { SelfImproveService } from './service'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitTools } from '../local/git'
import { createNodeLocalHost } from '../local/node-host'
import { createSelfImproveService } from './service'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

const context: FeedbackContext = {
  appVersion: '1.2.3',
  page: { route: '/', title: 'pull-review' },
  viewport: { width: 1322, height: 820 },
  theme: 'light',
  element: null,
  screenshot: PNG,
}

describe('the self-improve service', () => {
  let root: string
  let service: SelfImproveService

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pull-review-self-improve-'))
    mkdirSync(join(root, 'shipped'))
    writeFileSync(join(root, 'shipped/index.html'), 'hi\n')
    const host = createNodeLocalHost()
    service = createSelfImproveService(host, createGitTools(host), { root: join(root, 'overlay'), version: '1.2.3', parts: [{ name: 'app-web', from: join(root, 'shipped') }] })
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('queues a request and keeps its screenshot as a file', async () => {
    const change = await service.create({ request: '  remove the gap  ', context })
    expect(change).toMatchObject({ request: 'remove the gap', status: 'queued', version: '1.2.3', hasScreenshot: true, commits: [] })
    expect(change.context.screenshot).toBeNull()
    expect(readFileSync(service.screenshotPath(change.id)).subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4E, 0x47]))
    expect((await service.state()).changes.map(item => item.id)).toEqual([change.id])
  })

  it('rejects empty and very long requests', async () => {
    await expect(service.create({ request: '   ', context })).rejects.toThrow('Write what should change.')
    await expect(service.create({ request: 'x'.repeat(4001), context })).rejects.toThrow(/under 4000/)
  })

  it('keeps every request when several arrive at once', async () => {
    await Promise.all(['a', 'b', 'c'].map(request => service.create({ request, context: { ...context, screenshot: null } })))
    expect((await service.state()).changes.map(item => item.request).sort()).toEqual(['a', 'b', 'c'])
  })

  it('dismisses only waiting or failed requests', async () => {
    const change = await service.create({ request: 'a', context })
    expect(await service.dismiss(change.id)).toMatchObject({ status: 'dismissed' })
    await expect(service.dismiss(change.id)).rejects.toThrow(/Only waiting or failed/)
    await expect(service.dismiss('missing')).rejects.toThrow(/no longer exists/)
  })

  it('reports the overlay and a failed start, and turns local changes on only when they exist', async () => {
    expect(await service.state()).toMatchObject({ active: false, overlayDir: null, bootFailure: null, changes: [] })
    await expect(service.setActive(true)).rejects.toThrow(/no local changes/)

    await service.overlay.ensure()
    writeFileSync(join(root, 'overlay/boot-failure.json'), JSON.stringify({ version: '1.2.3', reason: 'Broke', at: 'now' }))
    expect((await service.state()).bootFailure?.reason).toBe('Broke')

    await service.setActive(true)
    expect(await service.state()).toMatchObject({ active: true, overlayDir: join(root, 'overlay/1.2.3'), bootFailure: null })
    expect(existsSync(join(root, 'overlay/boot-failure.json'))).toBe(false)
  })
})
