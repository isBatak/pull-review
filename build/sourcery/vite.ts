import type { Plugin } from 'vite'
import { SOURCE_ATTRIBUTE } from '../../src/shared/self-improve.ts'
import { transformJsx } from './transform.ts'

export function sourcery(root: string): Plugin {
  return {
    name: 'pull-review:sourcery',
    enforce: 'pre',
    transform: {
      order: 'pre',
      filter: { id: /\.(?:jsx|tsx)(?:\?|$)/ },
      handler(code, id) {
        const file = id.split('?', 1)[0] ?? id
        if (id.startsWith('\0') || file.includes('/node_modules/'))
          return null
        return transformJsx({ code, file, root, attribute: SOURCE_ATTRIBUTE })
      },
    },
  }
}
