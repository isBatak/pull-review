import { serve } from '@hono/node-server'
import process from 'node:process'
import { createApp } from './app'
import { createNodeLocalHost } from './local/node-host'
import { createChatService } from './chat/service'

const port = 5174

const host = createNodeLocalHost()
const chat = createChatService(host)

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => void chat.dispose().finally(() => process.exit(0)))

serve({ fetch: createApp({ cwd: process.cwd(), chat, host }).fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`API server on http://127.0.0.1:${port}, open the UI at http://localhost:5173`)
})
