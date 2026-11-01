import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import tinyConfig from '../../tinyjs.json'
import { APP_OVERLAY_ROOT, BOOT_READY_METHOD, createOverlayBoot, overlayPageUrl } from './self-improve'

const SHIPPED = 'file:///Applications/Pull%20Review.app/Contents/Resources/app/frontend/index.html'
const OVERLAY = 'file:///Users/me/overlay/1.0.0/build/app-web/index.html'

describe('self-improve paths', () => {
  it('lets the window read the overlay folder', () => {
    expect(tinyConfig.readAccess).toBe(`~/${APP_OVERLAY_ROOT}`)
  })

  it('lets every app page report that it started', () => {
    for (const calls of Object.values(tinyConfig.api.origins))
      expect(calls).toContain(BOOT_READY_METHOD)
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

  it('swaps again when a reload lands on the shipped page', () => {
    boot.onNavigate({ kind: 'finish', url: SHIPPED })
    boot.ready(OVERLAY)
    boot.onNavigate({ kind: 'finish', url: SHIPPED })
    expect(goTo).toHaveBeenCalledTimes(2)
    expect(boot.state).toBe('loading')
  })
})
