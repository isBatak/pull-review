import type { HierarchyRectangularNode } from 'd3-hierarchy'
import type { AnalyzerNode, ModuleSizeKey } from '../../../shared/bundle'
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy'
import { ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { css } from 'styled-system/css'
import { chunkKey, moduleSizeIndex, nodeSize } from '../../../shared/bundle'
import { formatBytes, formatDeltaBytes } from '../../lib/bytes'

interface TreeDatum {
  key: string
  name: string
  size: number
  children?: TreeDatum[]
}

const ROOT_KEY = 'root'
const CHUNK_PREFIX = /^static\/chunks\//
const HEADER_HEIGHT = 18
const MAP_HEIGHT = 520

function collapseChain(datum: TreeDatum): TreeDatum {
  let current = datum
  while (current.children?.length === 1 && current.children[0]!.children?.length)
    current = { ...current.children[0]!, name: `${current.name}/${current.children[0]!.name}` }
  return current
}

function toData(nodes: AnalyzerNode[], prefix: string, sizeKey: ModuleSizeKey): TreeDatum[] {
  return nodes.map((node) => {
    const key = `${prefix}/${node.label}`
    const children = node.groups?.length ? toData(node.groups, key, sizeKey) : undefined
    return collapseChain({ key, name: node.label, size: children ? 0 : nodeSize(node, sizeKey), children })
  })
}

function buildRoot(chunks: AnalyzerNode[], sizeKey: ModuleSizeKey): TreeDatum {
  return {
    key: ROOT_KEY,
    name: 'All chunks',
    size: 0,
    children: chunks.map((chunk) => {
      const key = `chunk:${chunkKey(chunk.label)}`
      let children = chunk.groups?.length ? toData(chunk.groups, key, sizeKey) : undefined
      while (children?.length === 1 && children[0]!.children?.length)
        children = children[0]!.children
      return { key, name: chunkKey(chunk.label).replace(CHUNK_PREFIX, ''), size: children ? 0 : nodeSize(chunk, sizeKey), children }
    }),
  }
}

const MODULE_FOLDERS = /(?:^|\/)(?:\.\.\/)*node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?/g

function displayName(name: string) {
  return name.replace(/^(?:\.\.\/)+/, '').replace(MODULE_FOLDERS, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/') || name
}

function baseIndex(chunks: AnalyzerNode[] | null, sizeKey: ModuleSizeKey) {
  if (!chunks)
    return null
  return moduleSizeIndex(chunks, sizeKey)
}

function findPath(root: TreeDatum, key: string): TreeDatum[] {
  if (root.key === key)
    return [root]
  for (const child of root.children ?? []) {
    if (key === child.key || key.startsWith(`${child.key}/`)) {
      const rest = findPath(child, key)
      if (rest.length)
        return [root, ...rest]
    }
  }
  return []
}

const SATURATION_BYTES = 10 * 1024

const CHUNK_HUES = ['violet', 'blue', 'teal', 'green', 'amber', 'orange', 'rose', 'slate']

function chunkColor(index: number) {
  return `color-mix(in srgb, var(--colors-${CHUNK_HUES[index % CHUNK_HUES.length]}-500) 28%, var(--colors-bg-surface))`
}

function tileColor(delta: number | null, isNew: boolean) {
  if (delta === null)
    return 'var(--colors-bg-muted)'
  if (isNew)
    return 'color-mix(in srgb, var(--colors-danger-solid) 70%, var(--colors-bg-surface))'
  if (delta === 0)
    return 'var(--colors-bg-muted)'
  const strength = 22 + Math.min(1, Math.abs(delta) / SATURATION_BYTES) * 50
  const tone = delta > 0 ? 'var(--colors-danger-solid)' : 'var(--colors-success-solid)'
  return `color-mix(in srgb, ${tone} ${strength.toFixed(0)}%, var(--colors-bg-surface))`
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element)
      return
    const observer = new ResizeObserver(entries => setWidth(Math.floor(entries[0]!.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

interface ModuleTreemapProps {
  current: AnalyzerNode[]
  base: AnalyzerNode[] | null
  sizeKey: ModuleSizeKey
}

export function ModuleTreemap({ current, base, sizeKey }: ModuleTreemapProps) {
  const root = useMemo(() => buildRoot(current, sizeKey), [current, sizeKey])
  const before = useMemo(() => baseIndex(base, sizeKey), [base, sizeKey])
  const [focusKey, setFocusKey] = useState(ROOT_KEY)
  const [hovered, setHovered] = useState<TreeDatum | null>(null)
  const [containerRef, width] = useWidth()

  const trail = useMemo(() => {
    const path = findPath(root, focusKey)
    return path.length ? path : [root]
  }, [root, focusKey])
  const focus = trail[trail.length - 1]!

  const tiles = useMemo(() => {
    if (!width)
      return []
    const layout = treemap<TreeDatum>()
      .tile(treemapSquarify.ratio(1.4))
      .size([width, MAP_HEIGHT])
      .paddingInner(1)
      .paddingOuter(depthPadding => (depthPadding.depth === 0 ? 0 : 2))
      .paddingTop(node => (node.depth === 1 ? HEADER_HEIGHT : node.depth === 0 ? 0 : 2))
      .round(true)
    const laidOut = layout(hierarchy(focus).sum(datum => (datum.children ? 0 : datum.size)).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)))
    return laidOut.descendants().filter(node => node.depth >= 1 && node.depth <= 3 && node.x1 - node.x0 >= 2 && node.y1 - node.y0 >= 2)
  }, [focus, width])

  const topIndex = new Map(tiles.filter(tile => tile.depth === 1).map((tile, index) => [tile.data.key, index]))

  function deltaOf(node: HierarchyRectangularNode<TreeDatum>) {
    if (!before)
      return { delta: null, isNew: false, base: null }
    const baseSize = before.get(node.data.key)
    if (baseSize === undefined)
      return { delta: node.value ?? 0, isNew: true, base: null }
    return { delta: (node.value ?? 0) - baseSize, isNew: false, base: baseSize }
  }

  const hoveredInfo = hovered && (() => {
    const baseSize = before?.get(hovered.key)
    const size = tiles.find(tile => tile.data.key === hovered.key)?.value ?? hovered.size
    return { size, baseSize }
  })()

  return (
    <div className={css({ display: 'flex', flexDir: 'column', gap: '2' })}>
      <nav aria-label="Treemap location" className={css({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5', fontSize: 'xs', minH: '6' })}>
        {trail.map((datum, index) => (
          <span key={datum.key} className={css({ display: 'inline-flex', alignItems: 'center', gap: '0.5', minW: '0' })}>
            {index > 0 && <ChevronRight className={css({ w: '3', h: '3', color: 'fg.subtle', flexShrink: 0 })} />}
            <button
              type="button"
              disabled={index === trail.length - 1}
              onClick={() => setFocusKey(datum.key)}
              className={css({ px: '1.5', h: '6', borderRadius: 'sm', fontFamily: index === 0 ? 'inherit' : 'mono', color: 'accent.fg', cursor: 'pointer', maxW: '320px', truncate: true, _hover: { bg: 'bg.muted' }, _disabled: { color: 'fg.default', fontWeight: 'semibold', cursor: 'default', bg: 'transparent' } })}
            >
              {index === 0 ? datum.name : displayName(datum.name)}
            </button>
          </span>
        ))}
      </nav>
      <div ref={containerRef} className={css({ position: 'relative', w: 'full', borderRadius: 'md', overflow: 'hidden', bg: 'bg.subtle', borderWidth: '1px', borderColor: 'border.default' })} style={{ height: MAP_HEIGHT }} onMouseLeave={() => setHovered(null)}>
        {tiles.map((node) => {
          const tileWidth = node.x1 - node.x0
          const tileHeight = node.y1 - node.y0
          const zoomable = Boolean(node.data.children?.length)
          const isHeader = node.depth === 1 && zoomable
          const { delta, isNew } = deltaOf(node)
          const chunkIndex = topIndex.get(node.ancestors().find(ancestor => ancestor.depth === 1)!.data.key) ?? 0
          const background = isHeader ? 'var(--colors-bg-surface)' : before ? tileColor(delta, isNew) : chunkColor(chunkIndex)
          const showLabel = tileWidth > 44 && tileHeight > 14
          return (
            <button
              key={node.data.key}
              type="button"
              aria-label={`${displayName(node.data.name)}, ${formatBytes(node.value ?? 0)}`}
              onMouseEnter={() => setHovered(node.data)}
              onFocus={() => setHovered(node.data)}
              onClick={(event) => {
                event.stopPropagation()
                if (zoomable)
                  setFocusKey(node.data.key)
              }}
              className={css({
                position: 'absolute',
                display: 'flex',
                flexDir: 'column',
                justifyContent: 'flex-start',
                alignItems: 'stretch',
                overflow: 'hidden',
                textAlign: 'left',
                borderWidth: '1px',
                borderColor: 'color-mix(in srgb, var(--colors-fg-default) 14%, transparent)',
                borderRadius: '2px',
                cursor: 'pointer',
                color: 'fg.default',
                _hover: { outline: '2px solid', outlineColor: 'accent.default', outlineOffset: '-2px' },
              })}
              style={{
                left: node.x0,
                top: node.y0,
                width: tileWidth,
                height: tileHeight,
                background,
                cursor: zoomable ? 'zoom-in' : 'default',
              }}
            >
              {showLabel && (
                <span className={css({ display: 'block', px: '1', fontSize: '2xs', lineHeight: '16px', fontWeight: isHeader ? 'semibold' : 'medium', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'mono' })}>
                  {displayName(node.data.name)}
                  {tileHeight > 30 && !isHeader && <span className={css({ display: 'block', fontFamily: 'body', color: 'fg.muted', fontWeight: 'normal' })}>{formatBytes(node.value ?? 0)}</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4', minH: '6', fontSize: 'xs', color: 'fg.muted' })}>
        <span className={css({ fontFamily: 'mono', minW: '0', truncate: true })}>
          {hovered && hoveredInfo
            ? (
                <>
                  <span className={css({ color: 'fg.default' })}>{displayName(hovered.name)}</span>
                  {'  '}
                  {formatBytes(hoveredInfo.size)}
                  {before && (hoveredInfo.baseSize === undefined ? '  new in this MR' : `  ${formatDeltaBytes(hoveredInfo.size - hoveredInfo.baseSize)} vs base`)}
                </>
              )
            : 'Hover a tile for details. Click a group to zoom in.'}
        </span>
        {before && (
          <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '3', flexShrink: 0 })}>
            <LegendSwatch color={tileColor(SATURATION_BYTES, false)} label="Bigger" />
            <LegendSwatch color={tileColor(-SATURATION_BYTES, false)} label="Smaller" />
            <LegendSwatch color={tileColor(1, true)} label="New" />
            <LegendSwatch color={tileColor(0, false)} label="Same" />
          </span>
        )}
      </div>
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string, label: string }) {
  return (
    <span className={css({ display: 'inline-flex', alignItems: 'center', gap: '1' })}>
      <span className={css({ w: '3', h: '3', borderRadius: '2px', borderWidth: '1px', borderColor: 'border.default' })} style={{ background: color }} />
      {label}
    </span>
  )
}
