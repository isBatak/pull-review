export interface SizePair {
  raw: number
  gzip: number
}

export interface RouteBundle extends SizePair {
  files: Record<string, SizePair>
}

export interface BundleAnalysis {
  __global: RouteBundle
  __server?: Record<string, { raw: number }>
  [route: string]: RouteBundle | Record<string, { raw: number }> | undefined
}

export type ChangeKind = 'added' | 'removed' | 'changed' | 'same'

export interface SizeDelta {
  current: number | null
  base: number | null
  delta: number
  kind: ChangeKind
}

export interface FileComparison {
  key: string
  file: string
  gzip: SizeDelta
  raw: SizeDelta
}

export interface RouteComparison {
  route: string
  routeGzip: SizeDelta
  routeRaw: SizeDelta
  firstLoadGzip: SizeDelta
  budgetPercent: number | null
  baseBudgetPercent: number | null
  files: FileComparison[]
}

export interface ServerComparison {
  route: string
  raw: SizeDelta
}

export interface BundleComparison {
  global: { gzip: SizeDelta, raw: SizeDelta, files: FileComparison[] }
  routes: RouteComparison[]
  server: ServerComparison[]
  totals: { clientGzip: SizeDelta, clientRaw: SizeDelta, routesChanged: number, routesTotal: number }
}

const HASH_SUFFIX = /[-.][0-9a-f]{8,}(?=\.[a-z]+$)/i

export function chunkKey(file: string) {
  return file.replace(HASH_SUFFIX, '')
}

function delta(current: number | null, base: number | null, threshold = 0): SizeDelta {
  if (current === null && base === null)
    return { current, base, delta: 0, kind: 'same' }
  if (base === null)
    return { current, base, delta: current!, kind: 'added' }
  if (current === null)
    return { current, base, delta: -base, kind: 'removed' }
  const difference = current - base
  return { current, base, delta: difference, kind: Math.abs(difference) > threshold ? 'changed' : 'same' }
}

function routeEntries(analysis: BundleAnalysis | null): Map<string, RouteBundle> {
  const routes = new Map<string, RouteBundle>()
  if (!analysis)
    return routes
  for (const [key, value] of Object.entries(analysis)) {
    if (key.startsWith('__') || !value || !('gzip' in value))
      continue
    routes.set(key, value as RouteBundle)
  }
  return routes
}

function compareFiles(current: Record<string, SizePair> | undefined, base: Record<string, SizePair> | undefined, threshold: number): FileComparison[] {
  const byKey = new Map<string, { file: string, current?: SizePair, base?: SizePair }>()
  for (const [file, size] of Object.entries(base ?? {}))
    byKey.set(chunkKey(file), { file, base: size })
  for (const [file, size] of Object.entries(current ?? {})) {
    const key = chunkKey(file)
    const entry = byKey.get(key)
    if (entry) {
      entry.file = file
      entry.current = size
    }
    else {
      byKey.set(key, { file, current: size })
    }
  }
  return [...byKey].map(([key, entry]) => ({
    key,
    file: entry.file,
    gzip: delta(entry.current?.gzip ?? null, entry.base?.gzip ?? null, threshold),
    raw: delta(entry.current?.raw ?? null, entry.base?.raw ?? null, threshold),
  })).sort((a, b) => Math.abs(b.gzip.delta) - Math.abs(a.gzip.delta) || (b.gzip.current ?? 0) - (a.gzip.current ?? 0))
}

export interface CompareOptions {
  budgetBytes?: number
  thresholdBytes?: number
}

export function compareBundles(current: BundleAnalysis | null, base: BundleAnalysis | null, options: CompareOptions = {}): BundleComparison {
  const threshold = options.thresholdBytes ?? 0
  const globalCurrent = current?.__global ?? null
  const globalBase = base?.__global ?? null
  const globalGzip = delta(globalCurrent?.gzip ?? null, globalBase?.gzip ?? null, threshold)
  const globalRaw = delta(globalCurrent?.raw ?? null, globalBase?.raw ?? null, threshold)

  const currentRoutes = routeEntries(current)
  const baseRoutes = routeEntries(base)
  const names = [...new Set([...currentRoutes.keys(), ...baseRoutes.keys()])]
  const percent = (bytes: number | null) => (options.budgetBytes && bytes !== null ? (bytes / options.budgetBytes) * 100 : null)

  const routes = names.map((route): RouteComparison => {
    const now = currentRoutes.get(route)
    const before = baseRoutes.get(route)
    const firstLoadNow = now && globalCurrent ? now.gzip + globalCurrent.gzip : null
    const firstLoadBefore = before && globalBase ? before.gzip + globalBase.gzip : null
    return {
      route,
      routeGzip: delta(now?.gzip ?? null, before?.gzip ?? null, threshold),
      routeRaw: delta(now?.raw ?? null, before?.raw ?? null, threshold),
      firstLoadGzip: delta(firstLoadNow, firstLoadBefore, threshold),
      budgetPercent: percent(firstLoadNow),
      baseBudgetPercent: percent(firstLoadBefore),
      files: compareFiles(now?.files, before?.files, threshold),
    }
  }).sort((a, b) => Math.abs(b.firstLoadGzip.delta) - Math.abs(a.firstLoadGzip.delta) || (b.firstLoadGzip.current ?? 0) - (a.firstLoadGzip.current ?? 0))

  const serverNames = [...new Set([...Object.keys(current?.__server ?? {}), ...Object.keys(base?.__server ?? {})])]
  const server = serverNames.map(route => ({
    route,
    raw: delta(current?.__server?.[route]?.raw ?? null, base?.__server?.[route]?.raw ?? null, threshold),
  })).sort((a, b) => Math.abs(b.raw.delta) - Math.abs(a.raw.delta) || (b.raw.current ?? 0) - (a.raw.current ?? 0))

  const sum = (routesMap: Map<string, RouteBundle>, key: 'gzip' | 'raw', global: RouteBundle | null) =>
    global ? [...routesMap.values()].reduce((total, route) => total + route[key], global[key]) : null

  return {
    global: { gzip: globalGzip, raw: globalRaw, files: compareFiles(globalCurrent?.files, globalBase?.files, threshold) },
    routes,
    server,
    totals: {
      clientGzip: delta(sum(currentRoutes, 'gzip', globalCurrent), sum(baseRoutes, 'gzip', globalBase), threshold),
      clientRaw: delta(sum(currentRoutes, 'raw', globalCurrent), sum(baseRoutes, 'raw', globalBase), threshold),
      routesChanged: routes.filter(route => route.firstLoadGzip.kind !== 'same').length,
      routesTotal: routes.length,
    },
  }
}

export interface AnalyzerNode {
  label: string
  path?: string
  statSize?: number
  parsedSize?: number
  gzipSize?: number
  groups?: AnalyzerNode[]
  isInitialByEntrypoint?: Record<string, boolean>
}

export type ModuleSizeKey = 'gzipSize' | 'parsedSize' | 'statSize'

const PACKAGE_PATH = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/

export function packageOf(modulePath: string): string | null {
  const match = PACKAGE_PATH.exec(modulePath)
  return match ? match[1]! : null
}

const OUTSIDE_APP_PATH = /^(?:\.\/)?(?:\.\.\/)+((?:[^/]+\/){0,2}[^/]+)\//

export const APP_CODE_LABEL = 'This app'

export function moduleOwner(modulePath: string): string {
  const pkg = packageOf(modulePath)
  if (pkg)
    return pkg
  const outside = OUTSIDE_APP_PATH.exec(modulePath)
  return outside ? outside[1]! : APP_CODE_LABEL
}

function walkModules(nodes: AnalyzerNode[], visit: (node: AnalyzerNode) => void) {
  for (const node of nodes) {
    if (node.groups?.length)
      walkModules(node.groups, visit)
    else
      visit(node)
  }
}

export interface PackageComparison {
  name: string
  size: SizeDelta
  modules: number
}

export function comparePackages(current: AnalyzerNode[] | null, base: AnalyzerNode[] | null, sizeKey: ModuleSizeKey = 'gzipSize'): PackageComparison[] {
  function totals(chunks: AnalyzerNode[] | null) {
    const result = new Map<string, { size: number, modules: number }>()
    if (!chunks)
      return result
    for (const chunk of chunks) {
      walkModules(chunk.groups ?? [], (node) => {
        const name = moduleOwner(node.path ?? node.label)
        const entry = result.get(name) ?? { size: 0, modules: 0 }
        entry.size += node[sizeKey] ?? 0
        entry.modules += 1
        result.set(name, entry)
      })
    }
    return result
  }
  const now = totals(current)
  const before = totals(base)
  const names = [...new Set([...now.keys(), ...before.keys()])]
  return names.map(name => ({
    name,
    size: delta(now.get(name)?.size ?? null, before.get(name)?.size ?? null),
    modules: now.get(name)?.modules ?? before.get(name)?.modules ?? 0,
  })).sort((a, b) => Math.abs(b.size.delta) - Math.abs(a.size.delta) || (b.size.current ?? 0) - (a.size.current ?? 0))
}

export function nodeSize(node: AnalyzerNode, sizeKey: ModuleSizeKey = 'gzipSize'): number {
  if (node[sizeKey] !== undefined)
    return node[sizeKey]!
  return (node.groups ?? []).reduce((total, child) => total + nodeSize(child, sizeKey), 0)
}

export function moduleSizeIndex(chunks: AnalyzerNode[] | null, sizeKey: ModuleSizeKey = 'gzipSize'): Map<string, number> {
  const index = new Map<string, number>()
  if (!chunks)
    return index
  function visit(node: AnalyzerNode, key: string): number {
    const size = node.groups?.length
      ? node.groups.reduce((total, child) => total + visit(child, `${key}/${child.label}`), 0)
      : node[sizeKey] ?? 0
    index.set(key, (index.get(key) ?? 0) + size)
    return size
  }
  for (const chunk of chunks)
    visit(chunk, `chunk:${chunkKey(chunk.label)}`)
  return index
}

export function trimAnalyzerNodes(value: unknown): AnalyzerNode[] | null {
  if (!Array.isArray(value))
    return null
  const trim = (node: Record<string, unknown>): AnalyzerNode => {
    const result: AnalyzerNode = { label: String(node.label ?? '') }
    if (typeof node.path === 'string')
      result.path = node.path
    for (const key of ['statSize', 'parsedSize', 'gzipSize'] as const) {
      if (typeof node[key] === 'number')
        result[key] = node[key]
    }
    if (Array.isArray(node.groups) && node.groups.length)
      result.groups = node.groups.filter(child => child && typeof child === 'object').map(child => trim(child as Record<string, unknown>))
    return result
  }
  return value.filter(node => node && typeof node === 'object').map(node => trim(node as Record<string, unknown>))
}

export const BUNDLE_COMMENT_MARKER = '<!-- nextjs-bundle-analysis:'
