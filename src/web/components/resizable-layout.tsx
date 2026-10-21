import type { ReactNode } from 'react'
import { Splitter, useSplitter } from '@ark-ui/react/splitter'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { css } from 'styled-system/css'
import { useStoredState } from '../lib/stored-state'

const DEFAULT_SIDEBAR_PX = 300
const MIN_SIDEBAR_PX = 200
const MAX_SIDEBAR_PERCENT = 50
const DEFAULT_ASIDE_PX = 420
const MIN_ASIDE_PX = 320
const MAX_ASIDE_PERCENT = 50
const MIN_MAIN_PERCENT = 20
const WIDE_LAYOUT_MIN_PX = 768

function subscribeToResize(listener: () => void) {
  window.addEventListener('resize', listener)
  return () => window.removeEventListener('resize', listener)
}

function useWindowWidth() {
  return useSyncExternalStore(subscribeToResize, () => window.innerWidth)
}

function percentOf(px: number, total: number, max: number) {
  return Math.min(max, (px / total) * 100)
}

function sizesFor(sidebarPx: number, asidePx: number, total: number) {
  const sidebar = percentOf(sidebarPx, total, MAX_SIDEBAR_PERCENT)
  if (asidePx === 0)
    return [sidebar, 100 - sidebar, 0]
  const aside = Math.min(percentOf(asidePx, total, MAX_ASIDE_PERCENT), 100 - sidebar - MIN_MAIN_PERCENT)
  return [sidebar, 100 - sidebar - aside, aside]
}

const trigger = css({
  position: 'relative',
  flexShrink: 0,
  w: '1px',
  bg: 'border.default',
  cursor: 'col-resize',
  outline: 'none',
  transition: 'background 120ms',
  _before: {
    content: '""',
    position: 'absolute',
    insetBlock: '0',
    insetInline: '-4px',
    zIndex: 1,
  },
  _hover: { bg: 'accent.default' },
  _focusVisible: { bg: 'accent.default' },
  '&[data-dragging]': { bg: 'accent.default' },
})

const fillPanel = css({ display: 'flex', minH: '0', minW: '0', '& > *': { flex: '1', minW: '0' } })

interface ResizableLayoutProps {
  sidebar: ReactNode
  aside?: ReactNode
  onAsideClose?: () => void
  children: ReactNode
}

function WideLayout({ sidebar, aside, onAsideClose, children }: ResizableLayoutProps) {
  const [sidebarPx, setSidebarPx] = useStoredState('pull-review:sidebar-width', DEFAULT_SIDEBAR_PX)
  const [asidePx, setAsidePx] = useStoredState('pull-review:chat-width', DEFAULT_ASIDE_PX)
  const hasAside = Boolean(aside)
  const [initialSize] = useState(() => sizesFor(sidebarPx, hasAside ? asidePx : 0, window.innerWidth))

  const splitter = useSplitter({
    panels: [
      { id: 'sidebar', minSize: `${MIN_SIDEBAR_PX}px`, maxSize: `${MAX_SIDEBAR_PERCENT}%`, resizeBehavior: 'preserve-pixel-size' },
      { id: 'main' },
      { id: 'aside', minSize: `${MIN_ASIDE_PX}px`, maxSize: `${MAX_ASIDE_PERCENT}%`, collapsible: true, collapsedSize: 0, resizeBehavior: 'preserve-pixel-size' },
    ],
    defaultSize: initialSize,
    onCollapse: (details) => {
      if (details.panelId === 'aside')
        onAsideClose?.()
    },
    onResizeEnd: (details) => {
      const [sidebarPercent, , asidePercent] = details.size
      if (sidebarPercent !== undefined)
        setSidebarPx(Math.round((sidebarPercent / 100) * window.innerWidth))
      if (asidePercent)
        setAsidePx(Math.round((asidePercent / 100) * window.innerWidth))
    },
  })

  // Compares the real panel with the open state on every render, so a splitter rebuilt from stale sizes (after a hot reload, for one) is corrected too.
  useEffect(() => {
    const collapsed = splitter.isPanelCollapsed('aside')
    if (hasAside && collapsed)
      splitter.setSizes(sizesFor(sidebarPx, asidePx, window.innerWidth))
    else if (!hasAside && !collapsed)
      splitter.collapsePanel('aside')
  })

  function reset(nextSidebarPx: number, nextAsidePx: number) {
    splitter.setSizes(sizesFor(nextSidebarPx, hasAside ? nextAsidePx : 0, window.innerWidth))
    setSidebarPx(nextSidebarPx)
    setAsidePx(nextAsidePx)
  }

  return (
    <Splitter.RootProvider value={splitter} className={css({ display: 'flex', minH: '0', minW: '0' })}>
      <Splitter.Panel id="sidebar" className={css({ minH: '0', minW: '0', overflow: 'hidden' })}>
        {sidebar}
      </Splitter.Panel>
      <Splitter.ResizeTrigger
        id="sidebar:main"
        aria-label="Resize sidebar. Double-click to reset."
        className={trigger}
        onDoubleClick={() => reset(DEFAULT_SIDEBAR_PX, asidePx)}
      />
      <Splitter.Panel id="main" className={fillPanel}>
        {children}
      </Splitter.Panel>
      <Splitter.ResizeTrigger
        id="main:aside"
        aria-label="Resize chat. Double-click to reset."
        hidden={!hasAside}
        className={trigger}
        onDoubleClick={() => reset(sidebarPx, DEFAULT_ASIDE_PX)}
      />
      <Splitter.Panel id="aside" className={fillPanel}>
        {aside}
      </Splitter.Panel>
    </Splitter.RootProvider>
  )
}

export function ResizableLayout({ sidebar, aside, onAsideClose, children }: ResizableLayoutProps) {
  const width = useWindowWidth()

  if (width < WIDE_LAYOUT_MIN_PX) {
    return (
      <div className={css({ position: 'relative', display: 'flex', minH: '0', '& > *': { flex: '1', minW: '0' } })}>
        {children}
        {aside && <div className={css({ position: 'absolute', inset: '0', zIndex: 'overlay', display: 'flex', '& > *': { flex: '1', minW: '0' } })}>{aside}</div>}
      </div>
    )
  }

  return <WideLayout sidebar={sidebar} aside={aside} onAsideClose={onAsideClose}>{children}</WideLayout>
}
