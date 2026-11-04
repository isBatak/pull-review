import type { FeedbackContext, LocalChange } from './self-improve'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import tinyConfig from '../../tinyjs.json'
import { APP_OVERLAY_ROOT, BOOT_READY_METHOD, RESTART_APP_METHOD, contextDetails, createOverlayBoot, elementLabel, elementText, overlayPageUrl, packagedAppDir, packagedBundle, reloadKind, requestTime, sourceLocation, trimHtml, withoutDetails, workingFor } from './self-improve'

const SHIPPED = 'file:///Applications/Pull%20Review.app/Contents/Resources/app/frontend/index.html'
const OVERLAY = 'file:///Users/me/overlay/1.0.0/build/app-web/index.html'

describe('self-improve paths', () => {
  it('lets the window read the overlay folder', () => {
    expect(tinyConfig.readAccess).toBe(`~/${APP_OVERLAY_ROOT}`)
  })

  it('lets every app page report that it started and ask for a restart', () => {
    for (const calls of Object.values(tinyConfig.api.origins))
      expect(calls).toEqual(expect.arrayContaining([BOOT_READY_METHOD, RESTART_APP_METHOD]))
  })

  it('finds the shipped app inside a packaged bundle only', () => {
    expect(packagedAppDir('/Applications/Pull Review.app/Contents/MacOS/tjs')).toBe('/Applications/Pull Review.app/Contents/Resources/app')
    expect(packagedAppDir('/Users/me/.tinyjs/bin/tjs')).toBeNull()
    expect(packagedBundle('/Applications/Pull Review.app/Contents/MacOS/pull-review')).toBe('/Applications/Pull Review.app')
  })

  it('points the window at the overlay page', () => {
    expect(overlayPageUrl('/Users/me/Library/Application Support/x/overlay/1.0.0')).toBe('file:///Users/me/Library/Application%20Support/x/overlay/1.0.0/build/app-web/index.html')
  })
})

describe('the overlay boot check', () => {
  let goTo: ReturnType<typeof vi.fn<(url: string) => void>>
  let onFailure: ReturnType<typeof vi.fn<(reason: string) => void>>
  let boot: ReturnType<typeof createOverlayBoot>

  beforeEach(() => {
    vi.useFakeTimers()
    goTo = vi.fn<(url: string) => void>()
    onFailure = vi.fn<(reason: string) => void>()
    boot = createOverlayBoot({ overlayPage: OVERLAY, timeoutMs: 1000, goTo, onFailure })
  })

  afterEach(() => vi.useRealTimers())

  it('moves to the overlay page once the shipped page has loaded', () => {
    boot.onNavigate({ kind: 'start', url: SHIPPED })
    expect(goTo).not.toHaveBeenCalled()
    boot.onNavigate({ kind: 'finish', url: `${SHIPPED}#/` })
    expect(goTo).toHaveBeenCalledWith(OVERLAY)
    expect(boot.state).toBe('loading')
  })

  it('keeps the overlay when it reports in time', () => {
    boot.onNavigate({ kind: 'finish', url: SHIPPED })
    boot.onNavigate({ kind: 'finish', url: OVERLAY })
    boot.ready(`${OVERLAY}#/`)
    vi.advanceTimersByTime(5000)
    expect(boot.state).toBe('ready')
    expect(onFailure).not.toHaveBeenCalled()
  })

  it('ignores a ready call from the shipped page', () => {
    boot.onNavigate({ kind: 'finish', url: SHIPPED })
    boot.ready(SHIPPED)
    expect(boot.state).toBe('loading')
  })

  it('goes back to the shipped page when the overlay never reports', () => {
    boot.onNavigate({ kind: 'finish', url: `${SHIPPED}#/x` })
    vi.advanceTimersByTime(1000)
    expect(onFailure).toHaveBeenCalledWith('The changed page did not start within 1 seconds.')
    expect(goTo).toHaveBeenLastCalledWith(SHIPPED)
    boot.onNavigate({ kind: 'finish', url: SHIPPED })
    expect(goTo).toHaveBeenCalledTimes(2)
  })

  it('goes back right away when the overlay page fails to load', () => {
    boot.onNavigate({ kind: 'finish', url: SHIPPED })
    boot.onNavigate({ kind: 'fail', url: OVERLAY, error: 'File not found' })
    expect(onFailure).toHaveBeenCalledWith('The changed page did not load: File not found')
    expect(goTo).toHaveBeenLastCalledWith(SHIPPED)
  })

  it('checks the changed page again when it reloads', () => {
    boot.onNavigate({ kind: 'finish', url: SHIPPED })
    boot.ready(OVERLAY)
    boot.onNavigate({ kind: 'start', url: `${OVERLAY}#/feedback` })
    expect(boot.state).toBe('loading')
    vi.advanceTimersByTime(1000)
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(goTo).toHaveBeenLastCalledWith(SHIPPED)
  })

  it('swaps again when a reload lands on the shipped page', () => {
    boot.onNavigate({ kind: 'finish', url: SHIPPED })
    boot.ready(OVERLAY)
    boot.onNavigate({ kind: 'finish', url: SHIPPED })
    expect(goTo).toHaveBeenCalledTimes(2)
    expect(boot.state).toBe('loading')
  })
})

describe('feedback context', () => {
  const context: FeedbackContext = {
    appVersion: '1.0.0',
    page: { route: '/releases/hotfix', title: 'Releases' },
    viewport: { width: 1322, height: 900 },
    theme: 'light',
    element: { label: 'Feedback', source: 'src/web/a.tsx:3:5', selector: 'nav > a', text: 'Feedback', html: '<a>Feedback</a>', styles: {}, rect: { x: 0, y: 0, width: 10, height: 10 } },
    screenshot: 'data:image/png;base64,AAAA',
  }

  it('names an element by its label, its text or its tag', () => {
    expect(elementLabel({ ariaLabel: ' Open   settings ', text: 'x', tag: 'BUTTON' })).toBe('Open settings')
    expect(elementLabel({ ariaLabel: null, text: '\n  Feedback\n', tag: 'A' })).toBe('Feedback')
    expect(elementLabel({ ariaLabel: null, text: '   ', tag: 'DIV' })).toBe('<div>')
    expect(elementLabel({ ariaLabel: null, text: 'a'.repeat(60), tag: 'P' })).toHaveLength(40)
  })

  it('keeps element text and markup short', () => {
    expect(elementText('a'.repeat(300))).toHaveLength(200)
    expect(trimHtml('<p>hello</p>', 5)).toBe('<p>he<!-- 7 more characters -->')
    expect(trimHtml('<p>hi</p>')).toBe('<p>hi</p>')
  })

  it('reads a sourcery location', () => {
    expect(sourceLocation('src/web/pages/home-page.tsx:309:5')).toEqual({ file: 'src/web/pages/home-page.tsx', line: 309, column: 5 })
    expect(sourceLocation(null)).toBeNull()
    expect(sourceLocation('nope')).toBeNull()
  })

  it('lists the details and drops the ones the user removed', () => {
    expect(contextDetails(context).map(detail => detail.key)).toEqual(['page', 'viewport', 'theme', 'element', 'screenshot'])
    expect(contextDetails(context)[1]?.value).toBe('1322 × 900 px')
    const trimmed = withoutDetails(context, ['screenshot', 'theme'])
    expect(contextDetails(trimmed).map(detail => detail.key)).toEqual(['page', 'viewport', 'element'])
    expect(trimmed.appVersion).toBe('1.0.0')
    expect(context.screenshot).not.toBeNull()
  })
})

describe('request times', () => {
  const now = new Date(2026, 9, 30, 22, 30)

  it('shows the time for today and the date for older requests', () => {
    expect(requestTime(new Date(2026, 9, 30, 22, 8).toISOString(), now)).toBe('Today 22:08')
    expect(requestTime(new Date(2026, 9, 27, 9, 0).toISOString(), now)).toBe('Oct 27')
  })

  it('says how long the agent has worked', () => {
    expect(workingFor(new Date(2026, 9, 30, 22, 29, 40).toISOString(), now)).toBe('just started')
    expect(workingFor(new Date(2026, 9, 30, 22, 27).toISOString(), now)).toBe('3 min')
  })
})

describe('reloading after a change', () => {
  const change = (status: LocalChange['status'], touchesBackend = false) => ({ status, touchesBackend }) as LocalChange

  it('asks for nothing until a change is ready', () => {
    expect(reloadKind([change('applied'), change('queued')], { overlay: true, canRestart: true })).toBeNull()
  })

  it('reloads the page when only the page changed and the changes are already loaded', () => {
    expect(reloadKind([change('ready')], { overlay: true, canRestart: true })).toBe('reload')
  })

  it('restarts for a backend change or the first local change', () => {
    expect(reloadKind([change('ready'), change('ready', true)], { overlay: true, canRestart: true })).toBe('restart')
    expect(reloadKind([change('ready')], { overlay: false, canRestart: true })).toBe('restart')
    expect(reloadKind([change('ready')], { overlay: false, canRestart: false })).toBe('restart-cli')
  })
})
