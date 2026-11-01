import type * as AppModule from './app'
import { APP_OVERLAY_ROOT, overlayPageUrl } from '../shared/self-improve'

const PACKAGED_RUNTIME = /\.app\/Contents\/MacOS\/[^/]+$/

async function findActiveOverlay(): Promise<string | null> {
  // The overlay's own copy of this loader must load its app, not look for an overlay again.
  if (globalThis.__pullReviewOverlay || !PACKAGED_RUNTIME.test(tjs.exePath))
    return null
  const root = `${tjs.homeDir}/${APP_OVERLAY_ROOT}`
  try {
    const version = new TextDecoder().decode(await tjs.readFile(`${root}/active`)).trim()
    if (version !== __APP_VERSION__)
      return null
    await tjs.stat(`${root}/${version}/build/app-backend/main.js`)
    return `${root}/${version}`
  }
  catch {
    return null
  }
}

const overlayDir = await findActiveOverlay()
if (overlayDir)
  globalThis.__pullReviewOverlay = overlayDir

const app: typeof AppModule = overlayDir
  ? await import(`${overlayDir}/build/app-backend/main.js`)
  : await import('./app')

type NavigationInfo = Parameters<typeof app.onNavigate>[0]

const overlayPage = overlayDir ? overlayPageUrl(overlayDir) : null

export const api = app.api
export const init = app.init

export function onNavigate(info: NavigationInfo, tinyApp: TinyApp) {
  if (overlayPage && info.kind === 'finish' && info.url?.startsWith('file:') && !info.url.startsWith(overlayPage))
    tinyApp.eval(`location.replace(${JSON.stringify(overlayPage)})`)
  return app.onNavigate(info)
}
