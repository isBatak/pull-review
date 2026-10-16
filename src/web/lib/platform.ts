interface BridgeResponse {
  status: number
  contentType: string
  text?: string
  base64?: string
}

interface TinyGlobal {
  api: {
    call: <T>(method: string, params?: unknown) => Promise<T>
    on: <T>(event: string, listener: (data: T) => void) => () => void
  }
  app: { shell: { open: (target: string) => Promise<unknown> } }
  clipboard?: { write: (data: { text: string }) => unknown }
}

const tinyGlobal = (globalThis as { tiny?: TinyGlobal }).tiny

export const isTinyApp = Boolean(tinyGlobal?.api)

export function callApp<T>(method: string): Promise<T> {
  if (!tinyGlobal)
    return Promise.reject(new Error('Only available in the desktop app'))
  return tinyGlobal.api.call<T>(method)
}

export function onAppEvent<T>(event: string, listener: (data: T) => void): () => void {
  return tinyGlobal?.api.on(event, listener) ?? (() => {})
}

export interface TransportResponse {
  ok: boolean
  status: number
  contentType: string
  text: () => Promise<string>
  blob: () => Promise<Blob>
}

function base64ToBlob(base64: string, type: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type })
}

export async function transport(method: string, path: string, body?: string): Promise<TransportResponse> {
  if (tinyGlobal) {
    const response = await tinyGlobal.api.call<BridgeResponse>('request', { method, path, body })
    const text = response.text ?? ''
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      contentType: response.contentType,
      text: async () => text,
      blob: async () => response.base64 !== undefined ? base64ToBlob(response.base64, response.contentType) : new Blob([text], { type: response.contentType }),
    }
  }
  const response = await fetch(path, {
    method,
    headers: { 'x-pull-review': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body,
  })
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    text: () => response.text(),
    blob: () => response.blob(),
  }
}

export async function copyText(text: string) {
  if (tinyGlobal?.clipboard) {
    await tinyGlobal.clipboard.write({ text })
    return
  }
  await navigator.clipboard.writeText(text)
}

export function openExternal(url: string) {
  if (tinyGlobal)
    void tinyGlobal.app.shell.open(url)
  else
    window.open(url, '_blank', 'noreferrer')
}

export function routeExternalLinks() {
  if (!tinyGlobal)
    return
  document.addEventListener('click', (event) => {
    const anchor = (event.target as Element | null)?.closest?.('a[href]')
    if (!anchor)
      return
    const href = anchor.getAttribute('href') ?? ''
    if (/^(?:https?:|mailto:)/i.test(href)) {
      event.preventDefault()
      openExternal(href)
    }
  }, true)
}
