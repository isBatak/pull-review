import pandacss from '@pandacss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { contentSecurityPolicy } from './build/content-security-policy'
import pkg from './package.json' with { type: 'json' }

const DEV_API_PORT = 5174

export default defineConfig({
  root: 'src/web',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [pandacss({ cwd: fileURLToPath(new URL('.', import.meta.url)) }), react(), contentSecurityPolicy()],
  resolve: {
    alias: {
      'styled-system': fileURLToPath(new URL('./styled-system', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${DEV_API_PORT}`,
        headers: { host: `127.0.0.1:${DEV_API_PORT}` },
      },
      '/icons': {
        target: `http://127.0.0.1:${DEV_API_PORT}`,
        headers: { host: `127.0.0.1:${DEV_API_PORT}` },
      },
    },
  },
  build: {
    outDir: '../../out/web',
    emptyOutDir: true,
  },
})
