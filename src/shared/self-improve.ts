export const APP_OVERLAY_ROOT = 'Library/Application Support/dev.pull-review.app/overlay'
export const BOOT_FAILURE_FILE = 'boot-failure.json'
export const BOOTING_FILE = 'booting'
export const BOOT_READY_METHOD = 'bootReady'
export const BOOT_TIMEOUT_MS = 10_000
export const OPTION_KEY_FLAG = 0x80000

export interface BootFailure {
  version: string
  reason: string
  at: string
}

export function overlayPageUrl(overlayDir: string) {
  return `file://${encodeURI(`${overlayDir}/build/app-web/index.html`)}`
}

export interface PageNavigation {
  kind: string
  url?: string
  error?: string
}

export interface OverlayBootOptions {
  overlayPage: string
  timeoutMs?: number
  goTo: (url: string) => void
  onFailure: (reason: string) => void
}

export type OverlayBoot = ReturnType<typeof createOverlayBoot>

export function createOverlayBoot({ overlayPage, timeoutMs = BOOT_TIMEOUT_MS, goTo, onFailure }: OverlayBootOptions) {
  let state: 'shipped' | 'loading' | 'ready' | 'failed' = 'shipped'
  let shippedPage: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function fail(reason: string) {
    if (state === 'failed')
      return
    state = 'failed'
    clearTimeout(timer)
    onFailure(reason)
    if (shippedPage)
      goTo(shippedPage)
  }

  function onNavigate({ kind, url, error }: PageNavigation) {
    if (state === 'failed' || !url?.startsWith('file:'))
      return
    const isOverlay = url.startsWith(overlayPage)
    if (isOverlay && state === 'loading' && (kind === 'fail' || kind === 'crash')) {
      fail(error ? `The changed page did not load: ${error}` : 'The changed page did not load.')
      return
    }
    if (isOverlay || kind !== 'finish')
      return
    shippedPage ??= url.split('#')[0] ?? url
    state = 'loading'
    clearTimeout(timer)
    timer = setTimeout(() => fail(`The changed page did not start within ${Math.round(timeoutMs / 1000)} seconds.`), timeoutMs)
    goTo(overlayPage)
  }

  function ready(pageUrl: string) {
    if (state !== 'loading' || !pageUrl.startsWith(overlayPage))
      return
    clearTimeout(timer)
    state = 'ready'
  }

  return { onNavigate, ready, fail, get state() { return state } }
}
