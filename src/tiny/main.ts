import { parseEnvOutput } from '../shared/env-output'
import { createApi } from '../server/api'
import { createChatService } from '../server/chat/service'
import { createTokenResolver } from '../server/token-core'
import { createTinyChatHost } from './chat-host'

const FALLBACK_PATHS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
const SHELL_TIMEOUT_MS = 5000

async function readAll(process: TjsProcess, timeoutMs: number): Promise<string> {
  const reader = process.stdout?.getReader()
  if (!reader)
    return ''
  const decoder = new TextDecoder()
  const timer = setTimeout(() => process.kill('SIGKILL'), timeoutMs)
  let output = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done)
        break
      output += decoder.decode(value, { stream: true })
    }
    await process.wait()
  }
  finally {
    clearTimeout(timer)
  }
  return output
}

async function run(args: string[], timeoutMs = SHELL_TIMEOUT_MS): Promise<string | null> {
  try {
    return await readAll(tjs.spawn(args, { stdout: 'pipe', stderr: 'ignore', stdin: 'ignore' }), timeoutMs)
  }
  catch {
    return null
  }
}

const loginShellEnv: Promise<Record<string, string>> = (async () => {
  const shell = tjs.env.SHELL || '/bin/zsh'
  const output = await run([shell, '-ilc', '/usr/bin/env -0'])
  return output ? parseEnvOutput(output) : {}
})()

async function findGlab(): Promise<string | null> {
  const env = await loginShellEnv
  const dirs = [...(env.PATH ?? tjs.env.PATH ?? '').split(':'), ...FALLBACK_PATHS].filter(Boolean)
  for (const dir of new Set(dirs)) {
    try {
      await tjs.stat(`${dir}/glab`)
      return `${dir}/glab`
    }
    catch {}
  }
  return null
}

const glabPath = findGlab()

const resolveToken = createTokenResolver({
  getEnv: async key => (await loginShellEnv)[key] ?? tjs.env[key],
  async readGlabToken(host) {
    const glab = await glabPath
    if (!glab)
      return null
    return (await run([glab, 'config', 'get', 'token', '--host', host]))?.trim() || null
  },
})

const chatEnv = loginShellEnv.then((env) => {
  const merged: Record<string, string> = {}
  for (const [key, value] of Object.entries(tjs.env)) {
    if (value !== undefined)
      merged[key] = value
  }
  return { ...merged, ...env }
})

const chat = createChatService(createTinyChatHost(() => chatEnv))

const server = createApi({ resolveToken, chat })

const TEXT_TYPE = /^(?:text\/|application\/(?:json|javascript|xml)|image\/svg\+xml)/

function toBase64(bytes: Uint8Array) {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk)
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  return btoa(binary)
}

export interface BridgeRequest {
  method: string
  path: string
  body?: string
}

export interface BridgeResponse {
  status: number
  contentType: string
  text?: string
  base64?: string
}

export const api = {
  async request({ method, path, body }: BridgeRequest): Promise<BridgeResponse> {
    const response = await server.fetch(new Request(`http://pull-review${path}`, {
      method,
      headers: { 'x-pull-review': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body,
    }))
    const contentType = response.headers.get('content-type') ?? ''
    if (TEXT_TYPE.test(contentType) || !contentType)
      return { status: response.status, contentType, text: await response.text() }
    return { status: response.status, contentType, base64: toBase64(new Uint8Array(await response.arrayBuffer())) }
  },
}

const DEV_ORIGIN = 'http://127.0.0.1:5173'
const APP_PAGE = /^(?:file|about):/i
const EXTERNAL_LINK = /^(?:https?|mailto):/i

interface NavigationInfo {
  kind: string
  url?: string
}

export function onNavigate(info: NavigationInfo): 'allow' | 'deny' | 'external' | undefined {
  if (info.kind !== 'policy')
    return undefined
  const url = info.url ?? ''
  if (APP_PAGE.test(url) || url === DEV_ORIGIN || url.startsWith(`${DEV_ORIGIN}/`))
    return 'allow'
  return EXTERNAL_LINK.test(url) ? 'external' : 'deny'
}
