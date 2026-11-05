import type { SourceMap } from './source-maps'
import { describe, expect, it } from 'vitest'
import { normalizePath, ownSources, repoRelativePath, trimSourceMap } from './source-maps'

const ROOT = '/repo'
const MAP_DIR = '/repo/out/app-web/assets'

function mapOf(sources: string[]): SourceMap {
  return { version: 3, sources, sourcesContent: sources.map(source => `content of ${source}`), names: [], mappings: 'AAAA' }
}

describe('source maps', () => {
  it('normalizes dot segments', () => {
    expect(normalizePath('/repo/out/../src/./web/main.tsx')).toBe('/repo/src/web/main.tsx')
    expect(normalizePath('../a/../../b')).toBe('../../b')
  })

  it('turns map sources into repository paths', () => {
    expect(repoRelativePath(MAP_DIR, '../../../src/web/main.tsx', ROOT)).toBe('src/web/main.tsx')
    expect(repoRelativePath('/repo/out/app-backend', '../../node_modules/hono/dist/index.js', ROOT)).toBe('node_modules/hono/dist/index.js')
    expect(repoRelativePath(MAP_DIR, '/elsewhere/file.ts', ROOT)).toBe('/elsewhere/file.ts')
  })

  it('keeps source text only for the app\'s own files', () => {
    const trimmed = trimSourceMap({ ...mapOf(['../../../src/web/main.tsx', '../../../node_modules/react/index.js', '../../../src/web/node_modules/x.js']), sourceRoot: '' }, MAP_DIR, ROOT)
    expect(trimmed?.sources).toEqual(['src/web/main.tsx', 'node_modules/react/index.js', 'src/web/node_modules/x.js'])
    expect(trimmed?.sourcesContent).toEqual(['content of ../../../src/web/main.tsx', null, null])
    expect(trimmed).not.toHaveProperty('sourceRoot')
  })

  it('drops maps with no own files', () => {
    expect(trimSourceMap(mapOf(['../../../node_modules/@shikijs/langs/dist/abap.mjs']), MAP_DIR, ROOT)).toBeNull()
  })

  it('lists own sources with their text', () => {
    const map = trimSourceMap(mapOf(['../../../src/a.ts', '../../../node_modules/b.js']), MAP_DIR, ROOT)!
    expect(ownSources(map)).toEqual([{ path: 'src/a.ts', content: 'content of ../../../src/a.ts' }])
  })
})
