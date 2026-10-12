import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { ChatService } from './chat/service'
import type { LocalHost } from './local/host'
import { createApi } from './api'
import { detectLocalRepo } from './detect'
import { resolveToken } from './token'

export { API_HEADER } from './api'

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])

export interface AppOptions {
  webRoot?: string
  initialPath?: string
  cwd?: string
  chat?: ChatService
  host?: LocalHost
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono()

  app.use('*', async (c, next) => {
    if (!LOCAL_HOSTNAMES.has(new URL(c.req.url).hostname))
      return c.text('Forbidden host', 403)
    await next()
  })

  const cwd = options.cwd
  const localRepo = cwd ? detectLocalRepo(cwd).catch(() => null) : Promise.resolve(null)
  app.route('/', createApi({ initialPath: options.initialPath, resolveToken, chat: options.chat, host: options.host, localRepo: () => localRepo }))

  const webRoot = options.webRoot
  if (webRoot && existsSync(webRoot)) {
    const indexHtml = readFile(join(webRoot, 'index.html'), 'utf8')
    app.use('/assets/*', serveStatic({ root: webRoot }))
    app.get('/favicon.svg', serveStatic({ root: webRoot }))
    app.get('*', async c => c.html(await indexHtml))
  }

  return app
}
