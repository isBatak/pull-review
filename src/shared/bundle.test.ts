import type { AnalyzerNode, BundleAnalysis } from './bundle'
import { describe, expect, it } from 'vitest'
import { chunkKey, compareBundles, comparePackages, moduleOwner, moduleSizeIndex, packageOf } from './bundle'

const base: BundleAnalysis = {
  __global: { raw: 1000, gzip: 400, files: { 'static/chunks/webpack-94aa766215799c49.js': { raw: 600, gzip: 250 }, 'static/chunks/main-1111111111111111.js': { raw: 400, gzip: 150 } } },
  '/trade/page': { raw: 500, gzip: 200, files: { 'static/chunks/app/trade/page-aaaaaaaaaaaaaaaa.js': { raw: 500, gzip: 200 } } },
  '/login/page': { raw: 100, gzip: 50, files: { 'static/chunks/app/login/page-bbbbbbbbbbbbbbbb.js': { raw: 100, gzip: 50 } } },
  '/old/page': { raw: 80, gzip: 30, files: {} },
  __server: { '/trade/page': { raw: 9000 }, '/old/page': { raw: 100 } },
}

const current: BundleAnalysis = {
  __global: { raw: 1100, gzip: 440, files: { 'static/chunks/webpack-0123456789abcdef.js': { raw: 700, gzip: 290 }, 'static/chunks/main-1111111111111111.js': { raw: 400, gzip: 150 } } },
  '/trade/page': { raw: 800, gzip: 320, files: { 'static/chunks/app/trade/page-cccccccccccccccc.js': { raw: 800, gzip: 320 } } },
  '/login/page': { raw: 100, gzip: 50, files: { 'static/chunks/app/login/page-bbbbbbbbbbbbbbbb.js': { raw: 100, gzip: 50 } } },
  '/new/page': { raw: 60, gzip: 20, files: {} },
  __server: { '/trade/page': { raw: 9500 }, '/new/page': { raw: 50 } },
}

describe('chunkKey', () => {
  it('drops the content hash so chunks match across builds', () => {
    expect(chunkKey('static/chunks/webpack-94aa766215799c49.js')).toBe('static/chunks/webpack.js')
    expect(chunkKey('static/chunks/app/trade/page-aaaaaaaaaaaaaaaa.js')).toBe('static/chunks/app/trade/page.js')
    expect(chunkKey('static/css/7ad91bc3d1c0e4f2.css')).toBe('static/css/7ad91bc3d1c0e4f2.css')
  })
})

describe('compareBundles', () => {
  const result = compareBundles(current, base, { budgetBytes: 1000 })

  it('compares the shared chunks and matches renamed hashes', () => {
    expect(result.global.gzip).toEqual({ current: 440, base: 400, delta: 40, kind: 'changed' })
    expect(result.global.files[0]).toMatchObject({ key: 'static/chunks/webpack.js', gzip: { delta: 40, kind: 'changed' } })
  })

  it('computes first load as route plus shared, sorted by change', () => {
    expect(result.routes.map(route => route.route)).toEqual(['/new/page', '/old/page', '/trade/page', '/login/page'])
    expect(result.routes.find(route => route.route === '/trade/page')).toMatchObject({ firstLoadGzip: { current: 760, base: 600, delta: 160, kind: 'changed' }, budgetPercent: 76, baseBudgetPercent: 60 })
    expect(result.routes.find(route => route.route === '/new/page')!.firstLoadGzip.kind).toBe('added')
    expect(result.routes.find(route => route.route === '/old/page')!.firstLoadGzip).toMatchObject({ kind: 'removed', delta: -430 })
    expect(result.routes.find(route => route.route === '/login/page')!.firstLoadGzip).toMatchObject({ delta: 40, kind: 'changed' })
  })

  it('counts changes with a threshold and compares server routes', () => {
    const quiet = compareBundles(current, base, { thresholdBytes: 50 })
    expect(quiet.routes.find(route => route.route === '/login/page')!.firstLoadGzip.kind).toBe('same')
    expect(result.server[0]).toMatchObject({ route: '/trade/page', raw: { delta: 500 } })
    expect(result.totals.routesTotal).toBe(4)
  })

  it('works when one side is missing', () => {
    const onlyBase = compareBundles(null, base)
    expect(onlyBase.global.gzip.kind).toBe('removed')
    expect(onlyBase.totals.clientGzip.current).toBeNull()
  })
})

const analyzerBase: AnalyzerNode[] = [{
  label: 'static/chunks/1234-aaaaaaaaaaaaaaaa.js',
  gzipSize: 300,
  groups: [{
    label: 'node_modules',
    groups: [
      { label: '.pnpm/react-dom@19.0.0/node_modules/react-dom/cjs/react-dom.production.js', path: './node_modules/.pnpm/react-dom@19.0.0/node_modules/react-dom/cjs/react-dom.production.js', gzipSize: 200 },
      { label: '@tanstack/query-core/build/modern/index.js', path: './node_modules/@tanstack/query-core/build/modern/index.js', gzipSize: 60 },
    ],
  }, { label: 'src/app/page.tsx', path: './src/app/page.tsx', gzipSize: 40 }],
}]

const analyzerCurrent: AnalyzerNode[] = [{
  label: 'static/chunks/1234-bbbbbbbbbbbbbbbb.js',
  gzipSize: 380,
  groups: [{
    label: 'node_modules',
    groups: [
      { label: '.pnpm/react-dom@19.0.0/node_modules/react-dom/cjs/react-dom.production.js', path: './node_modules/.pnpm/react-dom@19.0.0/node_modules/react-dom/cjs/react-dom.production.js', gzipSize: 200 },
      { label: '@tanstack/query-core/build/modern/index.js', path: './node_modules/@tanstack/query-core/build/modern/index.js', gzipSize: 60 },
      { label: 'lodash/lodash.js', path: './node_modules/lodash/lodash.js', gzipSize: 70 },
    ],
  }, { label: 'src/app/page.tsx', path: './src/app/page.tsx', gzipSize: 50 }],
}]

describe('packages', () => {
  it('reads package names from plain and pnpm paths', () => {
    expect(packageOf('./node_modules/.pnpm/react-dom@19.0.0/node_modules/react-dom/cjs/x.js')).toBe('react-dom')
    expect(packageOf('./node_modules/@tanstack/query-core/build/index.js')).toBe('@tanstack/query-core')
    expect(packageOf('./src/app/page.tsx')).toBeNull()
  })

  it('names workspace libraries outside the app by folder', () => {
    expect(moduleOwner('../../libs/frontend/ds/src/button.tsx')).toBe('libs/frontend/ds')
    expect(moduleOwner('./src/app/page.tsx')).toBe('This app')
    expect(moduleOwner('../../node_modules/.pnpm/zod@3.0.0/node_modules/zod/index.js')).toBe('zod')
  })

  it('compares package totals between builds', () => {
    const packages = comparePackages(analyzerCurrent, analyzerBase)
    expect(packages.map(pkg => [pkg.name, pkg.size.delta, pkg.size.kind])).toEqual([
      ['lodash', 70, 'added'],
      ['This app', 10, 'changed'],
      ['react-dom', 0, 'same'],
      ['@tanstack/query-core', 0, 'same'],
    ])
  })

  it('indexes module sizes by hash-free chunk path', () => {
    const index = moduleSizeIndex(analyzerBase)
    expect(index.get('chunk:static/chunks/1234.js/node_modules')).toBe(260)
    expect(index.get('chunk:static/chunks/1234.js/src/app/page.tsx')).toBe(40)
  })
})

describe('moduleSizeIndex totals', () => {
  it('sums leaf modules for chunks and groups, ignoring the group own size', () => {
    const index = moduleSizeIndex([{ label: 'static/chunks/9-aaaaaaaaaaaaaaaa.js', gzipSize: 999, groups: [{ label: 'src', gzipSize: 500, groups: [{ label: 'a.ts', gzipSize: 30 }, { label: 'b.ts', gzipSize: 20 }] }] }])
    expect(index.get('chunk:static/chunks/9.js')).toBe(50)
    expect(index.get('chunk:static/chunks/9.js/src')).toBe(50)
  })
})
