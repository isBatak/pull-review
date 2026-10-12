import { serve } from '@hono/node-server'
import { createApp } from './app'

const port = 5174

serve({ fetch: createApp().fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`API server on http://127.0.0.1:${port}, open the UI at http://localhost:5173`)
})
