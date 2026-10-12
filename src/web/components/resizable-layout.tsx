import type { ReactNode } from 'react'
import { Splitter, useSplitter } from '@ark-ui/react/splitter'
import { useState, useSyncExternalStore } from 'react'
import { css } from 'styled-system/css'
import { useStoredState } from '../lib/stored-state'

const DEFAULT_SIDEBAR_PX = 300
const MIN_SIDEBAR_PX = 200
const MAX_SIDEBAR_PERCENT = 50
const WIDE_LAYOUT_MIN_PX = 768

function subscribeToResize(listener: () => void) {
  window.addEventListener('resize', listener)
  return () => window.removeEventListener('resize', listener)
}

function useWindowWidth() {
  return useSyncExternalStore(subscribeToResize, () => window.innerWidth)
}

function sizesFor(sidebarPx: number, total: number) {
  const percent = Math.min(MAX_SIDEBAR_PERCENT, (sidebarPx / total) * 100)
  return [percent, 100 - percent]
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

interface ResizableLayoutProps {
  sidebar: ReactNode
  children: ReactNode
}

export function ResizableLayout({ sidebar, children }: ResizableLayoutProps) {
  const width = useWindowWidth()
  const [sidebarPx, setSidebarPx] = useStoredState('pull-review:sidebar-width', DEFAULT_SIDEBAR_PX)
  const [initialSize] = useState(() => sizesFor(sidebarPx, window.innerWidth))

  const splitter = useSplitter({
    panels: [
      { id: 'sidebar', minSize: `${MIN_SIDEBAR_PX}px`, maxSize: `${MAX_SIDEBAR_PERCENT}%`, resizeBehavior: 'preserve-pixel-size' },
      { id: 'main' },
    ],
    defaultSize: initialSize,
    onResizeEnd: (details) => {
      const [percent] = details.size
      if (percent !== undefined)
        setSidebarPx(Math.round((percent / 100) * window.innerWidth))
    },
  })

  if (width < WIDE_LAYOUT_MIN_PX)
    return <div className={css({ display: 'flex', minH: '0', '& > *': { flex: '1', minW: '0' } })}>{children}</div>

  return (
    <Splitter.RootProvider value={splitter} className={css({ display: 'flex', minH: '0', minW: '0' })}>
      <Splitter.Panel id="sidebar" className={css({ minH: '0', minW: '0', overflow: 'hidden' })}>
        {sidebar}
      </Splitter.Panel>
      <Splitter.ResizeTrigger
        id="sidebar:main"
        aria-label="Resize sidebar. Double-click to reset."
        className={trigger}
        onDoubleClick={() => {
          splitter.setSizes(sizesFor(DEFAULT_SIDEBAR_PX, window.innerWidth))
          setSidebarPx(DEFAULT_SIDEBAR_PX)
        }}
      />
      <Splitter.Panel id="main" className={css({ display: 'flex', minH: '0', minW: '0', '& > *': { flex: '1', minW: '0' } })}>
        {children}
      </Splitter.Panel>
    </Splitter.RootProvider>
  )
}
