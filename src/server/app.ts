import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApi } from './api'
import { resolveToken } from './token'

export { API_HEADER } from './api'

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])

export interface AppOptions {
  webRoot?: string
  initialPath?: string
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono()

  app.use('*', async (c, next) => {
    if (!LOCAL_HOSTNAMES.has(new URL(c.req.url).hostname))
      return c.text('Forbidden host', 403)
    await next()
  })

  app.route('/', createApi({ initialPath: options.initialPath, resolveToken }))

  const webRoot = options.webRoot
  if (webRoot && existsSync(webRoot)) {
    const indexHtml = readFile(join(webRoot, 'index.html'), 'utf8')
    app.use('/assets/*', serveStatic({ root: webRoot }))
    app.get('/favicon.svg', serveStatic({ root: webRoot }))
    app.get('*', async c => c.html(await indexHtml))
  }

  return app
}
