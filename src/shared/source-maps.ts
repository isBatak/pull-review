export interface SourceMap {
  version: number
  file?: string
  sourceRoot?: string
  sources: string[]
  sourcesContent?: Array<string | null>
  names: string[]
  mappings: string
  [key: string]: unknown
}

export function normalizePath(path: string): string {
  const absolute = path.startsWith('/')
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.')
      continue
    if (part === '..' && parts.length && parts[parts.length - 1] !== '..')
      parts.pop()
    else if (part !== '..' || !absolute)
      parts.push(part)
  }
  return (absolute ? '/' : '') + parts.join('/')
}

export function repoRelativePath(mapDir: string, source: string, root: string): string {
  const resolved = source.startsWith('/') ? normalizePath(source) : normalizePath(`${mapDir}/${source}`)
  const base = normalizePath(root)
  return resolved.startsWith(`${base}/`) ? resolved.slice(base.length + 1) : resolved
}

export function isOwnSource(path: string): boolean {
  return path.startsWith('src/') && !path.includes('/node_modules/')
}

export function trimSourceMap(map: SourceMap, mapDir: string, root: string): SourceMap | null {
  const sources = map.sources.map(source => repoRelativePath(mapDir, source, root))
  if (!sources.some(isOwnSource))
    return null
  const { sourceRoot: _sourceRoot, ...rest } = map
  return {
    ...rest,
    sources,
    sourcesContent: sources.map((path, index) => isOwnSource(path) ? map.sourcesContent?.[index] ?? null : null),
  }
}

export function ownSources(map: SourceMap): Array<{ path: string, content: string }> {
  return map.sources.flatMap((path, index) => {
    const content = map.sourcesContent?.[index]
    return isOwnSource(path) && typeof content === 'string' ? [{ path, content }] : []
  })
}
