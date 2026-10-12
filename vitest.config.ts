import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'styled-system': fileURLToPath(new URL('./styled-system', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
