import type { LocalChange } from './self-improve'
import { describe, expect, it } from 'vitest'
import { buildChangePrompt, buildChangeSystemPrompt, buildFollowUpPrompt } from './self-improve-prompt'

const change: LocalChange = {
  id: 'a',
  request: 'Remove the gap under the version badge',
  context: {
    appVersion: '1.0.0',
    page: { route: '/', title: 'pull-review' },
    viewport: { width: 1322, height: 820 },
    theme: 'dark',
    element: {
      label: 'v1.0.0',
      source: 'src/web/components/app-header.tsx:75:7',
      selector: 'header > div',
      text: 'v1.0.0',
      html: '<div>v1.0.0</div>',
      styles: { 'margin': '0px', 'gap': '', 'font-size': '12px' },
      rect: { x: 16, y: 8, width: 353, height: 17 },
    },
    screenshot: null,
  },
  hasScreenshot: true,
  touchesBackend: false,
  version: '1.0.0',
  status: 'queued',
  createdAt: '2026-11-04T10:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  commits: [],
  sessionId: null,
  summary: null,
  error: null,
  needsReload: false,
  replies: [],
  followUp: null,
}

describe('the change prompt', () => {
  it('describes the folder for the parts that shipped', () => {
    const prompt = buildChangeSystemPrompt(['app-web', 'app-backend'])
    expect(prompt).toContain('- build/app-web: the web page of the desktop app')
    expect(prompt).toContain('- build/app-backend: the desktop app\'s backend')
    expect(prompt).not.toContain('cli.mjs')
    expect(prompt).toContain('data-sourcery')
  })

  it('gives the request, the page, the element and the screenshot', () => {
    const prompt = buildChangePrompt(change, '/overlay/attachments/a/screenshot.png')
    expect(prompt).toContain('Request: Remove the gap under the version badge')
    expect(prompt).toContain('- Page: pull-review (route /)')
    expect(prompt).toContain('- Window: 1322 × 820 px')
    expect(prompt).toContain('- Rendered by source/src/web/components/app-header.tsx, line 75 (data-sourcery="src/web/components/app-header.tsx:75:7")')
    expect(prompt).toContain('- Computed styles: margin: 0px; font-size: 12px')
    expect(prompt).toContain('```html\n<div>v1.0.0</div>\n```')
    expect(prompt).toMatch(/at \/overlay\/attachments\/a\/screenshot\.png\. Open it with Read/)
  })

  it('leaves out what the user removed', () => {
    const prompt = buildChangePrompt({ ...change, context: { ...change.context, page: null, viewport: null, theme: null, element: null } }, null)
    expect(prompt).toBe('Request: Remove the gap under the version badge')
  })

  it('passes a reply on with a reminder to look again', () => {
    const prompt = buildFollowUpPrompt('Make it a bit smaller')
    expect(prompt).toMatch(/^The user replied about this request:\n\nMake it a bit smaller\n\n/)
    expect(prompt).toContain('look at the files again')
  })
})
