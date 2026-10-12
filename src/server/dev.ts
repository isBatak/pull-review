import { serve } from '@hono/node-server'
import process from 'node:process'
import { createApp } from './app'
import { createNodeChatHost } from './chat/node-host'
import { createChatService } from './chat/service'

const port = 5174

const chat = createChatService(createNodeChatHost())

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => void chat.dispose().finally(() => process.exit(0)))

serve({ fetch: createApp({ cwd: process.cwd(), chat }).fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`API server on http://127.0.0.1:${port}, open the UI at http://localhost:5173`)
})
