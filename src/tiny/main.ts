import type * as AppModule from './app'
import type { BootFailure, OverlayBoot, PageNavigation } from '../shared/self-improve'
import { APP_OVERLAY_ROOT, BOOT_FAILURE_FILE, BOOTING_FILE, createOverlayBoot, OPTION_KEY_FLAG, overlayPageUrl, packagedAppDir, packagedBundle } from '../shared/self-improve'

const OVERLAY_ROOT = `${tjs.homeDir}/${APP_OVERLAY_ROOT}`
const BOOTING_MARKER = `${OVERLAY_ROOT}/${BOOTING_FILE}`
const MODIFIER_FLAGS_SCRIPT = 'ObjC.import("AppKit"); $.NSEvent.modifierFlags'

const RESTART_DELAY_S = 1

let startFailure: string | null = null

const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function exists(path: string) {
  try {
    await tjs.stat(path)
    return true
  }
  catch {
    return false
  }
}

async function isOptionKeyDown() {
  try {
    const process = tjs.spawn(['/usr/bin/osascript', '-l', 'JavaScript', '-e', MODIFIER_FLAGS_SCRIPT], { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' })
    const reader = process.stdout?.getReader()
    let output = ''
    for (;;) {
      const chunk = await reader?.read()
      if (!chunk || chunk.done)
        break
      output += decoder.decode(chunk.value, { stream: true })
    }
    await process.wait()
    return (Number(output.trim()) & OPTION_KEY_FLAG) !== 0
  }
  catch {
    return false
  }
}

async function findActiveOverlay(): Promise<string | null> {
  // The overlay's own copy of this loader must load its app, not look for an overlay again.
  if (globalThis.__pullReviewOverlay || !packagedAppDir(tjs.exePath))
    return null
  try {
    const version = decoder.decode(await tjs.readFile(`${OVERLAY_ROOT}/active`)).trim()
    if (version !== __APP_VERSION__)
      return null
    await tjs.stat(`${OVERLAY_ROOT}/${version}/build/app-backend/main.js`)
  }
  catch {
    return null
  }
  if (await exists(BOOTING_MARKER)) {
    startFailure = 'The app closed while it started the changed backend.'
    await turnOffOverlay(startFailure)
    return null
  }
  return await isOptionKeyDown() ? null : `${OVERLAY_ROOT}/${__APP_VERSION__}`
}

async function turnOffOverlay(reason: string) {
  const failure: BootFailure = { version: __APP_VERSION__, reason, at: new Date().toISOString() }
  try {
    await tjs.writeFile(`${OVERLAY_ROOT}/active`, encoder.encode('off\n'))
    await tjs.writeFile(`${OVERLAY_ROOT}/${BOOT_FAILURE_FILE}`, encoder.encode(`${JSON.stringify(failure, null, 2)}\n`))
    await tjs.remove(BOOTING_MARKER).catch(() => undefined)
  }
  catch {}
}

async function loadApp(overlayDir: string | null): Promise<{ app: typeof AppModule, overlayDir: string | null }> {
  if (!overlayDir)
    return { app: await import('./app'), overlayDir: null }
  globalThis.__pullReviewOverlay = overlayDir
  // txiki.js crashes when an imported module throws while loading, even inside try, so a marker file catches it on the next start.
  await tjs.writeFile(BOOTING_MARKER, encoder.encode(`${__APP_VERSION__}\n`))
  const app: typeof AppModule = await import(`${overlayDir}/build/app-backend/main.js`)
  await tjs.remove(BOOTING_MARKER)
  return { app, overlayDir }
}

const { app, overlayDir } = await loadApp(await findActiveOverlay())

function report(action: 'applied' | 'broken', body?: unknown) {
  return app.api.request({ method: 'POST', path: `/api/self-improve/${action}`, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null)
}

if (startFailure)
  void report('broken', { reason: startFailure })

let boot: OverlayBoot | null = null
let appWindow: TinyApp | null = null

export const api = {
  ...app.api,
  bootReady({ url }: { url: string }) {
    boot?.ready(url)
    if (boot?.state === 'ready')
      void report('applied')
    return true
  },
  restartApp() {
    const bundle = packagedBundle(tjs.exePath)
    if (!bundle || !appWindow)
      return false
    tjs.spawn(['/bin/sh', '-c', `sleep ${RESTART_DELAY_S}; exec /usr/bin/open -n "$0"`, bundle], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' })
    const closing = appWindow
    setTimeout(() => closing.quit(), 100)
    return true
  },
}

export function init(tinyApp: TinyApp) {
  appWindow = tinyApp
  app.init(tinyApp)
  if (overlayDir) {
    boot = createOverlayBoot({
      overlayPage: overlayPageUrl(overlayDir),
      goTo: url => tinyApp.eval(`location.replace(${JSON.stringify(url)})`),
      onFailure: (reason) => {
        void turnOffOverlay(reason)
        void report('broken', { reason })
      },
    })
  }
}

export function onNavigate(info: PageNavigation) {
  boot?.onNavigate(info)
  return app.onNavigate(info)
}
