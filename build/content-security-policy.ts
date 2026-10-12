import type { Plugin } from 'vite'
import { createHash } from 'node:crypto'

const INLINE_SCRIPT = /<script>([\s\S]*?)<\/script>/g

export function contentSecurityPolicy(): Plugin {
  return {
    name: 'pull-review:content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const scriptHashes = [...html.matchAll(INLINE_SCRIPT)].map(match => `'sha256-${createHash('sha256').update(match[1]!).digest('base64')}'`)
        const policy = [
          `default-src 'none'`,
          `script-src 'self' file: ${scriptHashes.join(' ')}`.trim(),
          `style-src 'self' file: 'unsafe-inline'`,
          `img-src 'self' file: data: blob: https:`,
          `font-src 'self' file: data:`,
          `connect-src 'self'`,
          `worker-src 'self' blob:`,
          `base-uri 'none'`,
          `form-action 'none'`,
          `frame-src 'none'`,
          `object-src 'none'`,
        ].join('; ')
        return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`)
      },
    },
  }
}
