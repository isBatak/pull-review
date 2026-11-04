import type { ChatToolUse } from './chat'

export const APP_OVERLAY_ROOT = 'Library/Application Support/dev.pull-review.app/overlay'
export const BOOT_FAILURE_FILE = 'boot-failure.json'
export const BOOTING_FILE = 'booting'
export const BOOT_READY_METHOD = 'bootReady'
export const RESTART_APP_METHOD = 'restartApp'
export const BOOT_TIMEOUT_MS = 10_000
export const OPTION_KEY_FLAG = 0x80000
export const SOURCE_ATTRIBUTE = 'data-sourcery'
export const SELF_IMPROVE_UI_ATTRIBUTE = 'data-self-improve-ui'

export interface BootFailure {
  version: string
  reason: string
  at: string
}

const PACKAGED_RUNTIME = /^(.*\.app)\/Contents\/MacOS\/[^/]+$/

export function packagedBundle(exePath: string) {
  return PACKAGED_RUNTIME.exec(exePath)?.[1] ?? null
}

export function packagedAppDir(exePath: string) {
  const bundle = packagedBundle(exePath)
  return bundle ? `${bundle}/Contents/Resources/app` : null
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

  function wait() {
    state = 'loading'
    clearTimeout(timer)
    timer = setTimeout(() => fail(`The changed page did not start within ${Math.round(timeoutMs / 1000)} seconds.`), timeoutMs)
  }

  function onNavigate({ kind, url, error }: PageNavigation) {
    if (state === 'failed' || !url?.startsWith('file:'))
      return
    const isOverlay = url.startsWith(overlayPage)
    if (isOverlay && state === 'loading' && (kind === 'fail' || kind === 'crash')) {
      fail(error ? `The changed page did not load: ${error}` : 'The changed page did not load.')
      return
    }
    if (isOverlay && state === 'ready' && kind === 'start') {
      wait()
      return
    }
    if (isOverlay || kind !== 'finish')
      return
    shippedPage ??= url.split('#')[0] ?? url
    wait()
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

export interface PickedElement {
  label: string
  source: string | null
  selector: string
  text: string
  html: string
  styles: Record<string, string>
  rect: { x: number, y: number, width: number, height: number }
}

export interface FeedbackContext {
  appVersion: string
  page: { route: string, title: string } | null
  viewport: { width: number, height: number } | null
  theme: 'light' | 'dark' | null
  element: PickedElement | null
  screenshot: string | null
}

export type ContextDetail = 'page' | 'viewport' | 'theme' | 'element' | 'screenshot'

const LABEL_LENGTH = 40
const TEXT_LENGTH = 200
export const HTML_LENGTH = 2000

export const KEY_STYLES = ['display', 'position', 'width', 'height', 'margin', 'padding', 'gap', 'font-size', 'font-weight', 'line-height', 'color', 'background-color', 'border', 'border-radius'] as const

function collapse(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function cut(text: string, length: number) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

export function elementLabel({ ariaLabel, text, tag }: { ariaLabel: string | null, text: string, tag: string }) {
  const name = collapse(ariaLabel ?? '') || collapse(text)
  return name ? cut(name, LABEL_LENGTH) : `<${tag.toLowerCase()}>`
}

export function elementText(text: string) {
  return cut(collapse(text), TEXT_LENGTH)
}

export function trimHtml(html: string, length = HTML_LENGTH) {
  return html.length > length ? `${html.slice(0, length)}<!-- ${html.length - length} more characters -->` : html
}

export function sourceLocation(source: string | null) {
  const match = source ? /^(.*):(\d+):(\d+)$/.exec(source) : null
  return match ? { file: match[1]!, line: Number(match[2]), column: Number(match[3]) } : null
}

export function contextDetails(context: FeedbackContext): Array<{ key: ContextDetail, label: string, value: string }> {
  return [
    context.page && { key: 'page' as const, label: 'Page', value: `${context.page.title} (${context.page.route})` },
    context.viewport && { key: 'viewport' as const, label: 'Window', value: `${context.viewport.width} × ${context.viewport.height} px` },
    context.theme && { key: 'theme' as const, label: 'Theme', value: context.theme },
    context.element && { key: 'element' as const, label: 'Element', value: context.element.source ?? context.element.selector },
    context.screenshot && { key: 'screenshot' as const, label: 'Screenshot', value: 'Picture of the window' },
  ].filter(detail => !!detail)
}

export function withoutDetails(context: FeedbackContext, omitted: Iterable<ContextDetail>): FeedbackContext {
  const next = { ...context }
  for (const key of omitted)
    next[key] = null
  return next
}

export type ChangeStatus = 'queued' | 'working' | 'ready' | 'applied' | 'needs-you' | 'broke-app' | 'undone' | 'dismissed'

export interface LocalChange {
  id: string
  request: string
  context: FeedbackContext
  hasScreenshot: boolean
  touchesBackend: boolean
  version: string
  status: ChangeStatus
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  commits: string[]
  sessionId: string | null
  summary: string | null
  error: string | null
  needsReload: boolean
  replies: ChangeReply[]
  followUp: string | null
}

export interface ChangeReply {
  text: string
  at: string
}

export interface ChangeDiffFile {
  commit: string
  area: 'source' | 'build'
  path: string
  diff: string | null
}

export const NEW_CHANGE_FIELDS: Pick<LocalChange, 'touchesBackend' | 'needsReload' | 'replies' | 'followUp'> = {
  touchesBackend: false,
  needsReload: false,
  replies: [],
  followUp: null,
}

export interface ChangeRun {
  changeId: string
  text: string
  tools: ChatToolUse[]
}

export interface SelfImproveState {
  active: boolean
  overlayDir: string | null
  bootFailure: BootFailure | null
  changes: LocalChange[]
  run: ChangeRun | null
  reload: ReloadKind | null
}

export type ReloadKind = 'reload' | 'restart' | 'restart-cli'

export interface RunningBuild {
  overlay: boolean
  canRestart: boolean
}

export function reloadKind(changes: LocalChange[], running: RunningBuild): ReloadKind | null {
  const ready = changes.filter(change => change.needsReload)
  if (!ready.length)
    return null
  if (running.overlay && !ready.some(change => change.touchesBackend))
    return 'reload'
  return running.canRestart ? 'restart' : 'restart-cli'
}

export const OPEN_STATUSES: ChangeStatus[] = ['queued', 'working']
export const NEEDS_YOU_STATUSES: ChangeStatus[] = ['needs-you', 'broke-app']
export const DONE_STATUSES: ChangeStatus[] = ['ready', 'applied', 'undone']

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/

export function pngBytes(dataUrl: string): Uint8Array | null {
  const match = PNG_DATA_URL.exec(dataUrl)
  if (!match)
    return null
  const binary = atob(match[1]!)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function requestTime(iso: string, now = new Date()) {
  const date = new Date(iso)
  const sameDay = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return sameDay ? `Today ${time}` : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function workingFor(startIso: string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(startIso).getTime()) / 60_000))
  return minutes < 1 ? 'just started' : `${minutes} min`
}
